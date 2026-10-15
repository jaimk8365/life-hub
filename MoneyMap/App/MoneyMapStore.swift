import Foundation
import LocalAuthentication
import Combine

@MainActor
final class MoneyMapStore: ObservableObject {
    @Published private(set) var snapshot = MoneyMapSnapshot()
    @Published private(set) var isUnlocked = false
    @Published var message: String?

    private let crypto = VaultCrypto()
    private let keychain = BiometricKeychain()
    private var currentPasscode: String?

    var vaultExists: Bool { FileManager.default.fileExists(atPath: vaultURL.path) }
    var canUseBiometrics: Bool { keychain.containsPasscode }

    func createVault(passcode: String) async {
        guard passcode.count >= 6 else {
            message = "Choose a passcode with at least six characters."
            return
        }
        currentPasscode = passcode
        snapshot = MoneyMapSnapshot()
        do {
            try save()
            try? keychain.save(passcode: passcode)
            isUnlocked = true
        } catch { message = error.localizedDescription }
    }

    func unlock(passcode: String) async {
        do {
            try open(passcode: passcode)
        } catch { message = error.localizedDescription }
    }

    func unlockWithBiometrics() async {
        do {
            let passcode = try await keychain.readPasscode(reason: "Unlock your Money Map")
            try open(passcode: passcode)
        } catch { message = error.localizedDescription }
    }

    func lock() {
        snapshot = MoneyMapSnapshot()
        currentPasscode = nil
        isUnlocked = false
    }

    func importLifeHubBackup(from url: URL) async {
        guard url.startAccessingSecurityScopedResource() else {
            message = "Money Map could not access that file."
            return
        }
        defer { url.stopAccessingSecurityScopedResource() }
        do {
            snapshot = try LegacyFinanceImporter().importBackup(Data(contentsOf: url))
            try save()
            message = "Imported \(snapshot.accounts.count) accounts, \(snapshot.transactions.count) transactions and \(snapshot.bills.count) bills."
        } catch { message = error.localizedDescription }
    }

    private func open(passcode: String) throws {
        let encrypted = try Data(contentsOf: vaultURL)
        let data = try crypto.open(encrypted, passcode: passcode)
        snapshot = try JSONDecoder().decode(MoneyMapSnapshot.self, from: data)
        currentPasscode = passcode
        try? keychain.save(passcode: passcode)
        isUnlocked = true
    }

    private func save() throws {
        guard let currentPasscode else { throw MoneyMapStoreError.locked }
        let directory = vaultURL.deletingLastPathComponent()
        try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
        let encoded = try JSONEncoder().encode(snapshot)
        let encrypted = try crypto.seal(encoded, passcode: currentPasscode)
        try encrypted.write(to: vaultURL, options: [.atomic, .completeFileProtection])
    }

    private var vaultURL: URL {
        let base = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask).first!
        return base.appendingPathComponent("MoneyMap", isDirectory: true).appendingPathComponent("money-map.vault")
    }
}

enum MoneyMapStoreError: Error, LocalizedError {
    case locked
    var errorDescription: String? { "Unlock Money Map before saving." }
}
