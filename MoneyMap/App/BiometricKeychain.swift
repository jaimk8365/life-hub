import Foundation
import Security

struct BiometricKeychain: Sendable {
    private let service = "au.com.jaimikyte.moneymap"
    private let account = "vault-passcode"

    var containsPasscode: Bool {
        var query = baseQuery
        query[kSecMatchLimit as String] = kSecMatchLimitOne
        return SecItemCopyMatching(query as CFDictionary, nil) == errSecSuccess
    }

    func save(passcode: String) throws {
        SecItemDelete(baseQuery as CFDictionary)
        var error: Unmanaged<CFError>?
        guard let control = SecAccessControlCreateWithFlags(
            nil,
            kSecAttrAccessibleWhenUnlockedThisDeviceOnly,
            .userPresence,
            &error
        ) else { throw error!.takeRetainedValue() as Error }
        var query = baseQuery
        query[kSecValueData as String] = Data(passcode.utf8)
        query[kSecAttrAccessControl as String] = control
        let status = SecItemAdd(query as CFDictionary, nil)
        guard status == errSecSuccess else { throw KeychainError.status(status) }
    }

    func readPasscode(reason: String) async throws -> String {
        try await Task.detached {
            var query = baseQuery
            query[kSecReturnData as String] = true
            query[kSecMatchLimit as String] = kSecMatchLimitOne
            query[kSecUseOperationPrompt as String] = reason
            var item: CFTypeRef?
            let status = SecItemCopyMatching(query as CFDictionary, &item)
            guard status == errSecSuccess,
                  let data = item as? Data,
                  let passcode = String(data: data, encoding: .utf8) else {
                throw KeychainError.status(status)
            }
            return passcode
        }.value
    }

    private var baseQuery: [String: Any] {
        [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: account
        ]
    }
}

enum KeychainError: Error, LocalizedError {
    case status(OSStatus)
    var errorDescription: String? {
        switch self {
        case .status(errSecUserCanceled): "Unlock was cancelled."
        case .status(errSecItemNotFound): "Biometric unlock has not been set up yet."
        case .status: "Money Map could not use the secure Keychain."
        }
    }
}
