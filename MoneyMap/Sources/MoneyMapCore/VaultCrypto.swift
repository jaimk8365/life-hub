import CryptoKit
import Foundation

public enum VaultCryptoError: Error, Equatable, LocalizedError {
    case invalidEnvelope
    case authenticationFailed

    public var errorDescription: String? {
        switch self {
        case .invalidEnvelope: "This is not a Money Map vault."
        case .authenticationFailed: "The passcode is incorrect or the vault has been damaged."
        }
    }
}

public struct VaultCrypto: Sendable {
    public let iterations: Int

    public init(iterations: Int = 300_000) {
        self.iterations = max(1, iterations)
    }

    public func seal(_ plaintext: Data, passcode: String) throws -> Data {
        let salt = randomData(count: 16)
        let key = deriveKey(passcode: passcode, salt: salt)
        let box = try AES.GCM.seal(plaintext, using: key)
        guard let combined = box.combined else { throw VaultCryptoError.invalidEnvelope }
        return try JSONEncoder().encode(Envelope(
            version: 1,
            iterations: iterations,
            salt: salt.base64EncodedString(),
            sealed: combined.base64EncodedString()
        ))
    }

    public func open(_ encrypted: Data, passcode: String) throws -> Data {
        guard let envelope = try? JSONDecoder().decode(Envelope.self, from: encrypted),
              envelope.version == 1,
              envelope.iterations > 0,
              let salt = Data(base64Encoded: envelope.salt),
              let sealed = Data(base64Encoded: envelope.sealed),
              let box = try? AES.GCM.SealedBox(combined: sealed) else {
            throw VaultCryptoError.invalidEnvelope
        }
        let key = VaultCrypto(iterations: envelope.iterations).deriveKey(passcode: passcode, salt: salt)
        do { return try AES.GCM.open(box, using: key) }
        catch { throw VaultCryptoError.authenticationFailed }
    }

    private func deriveKey(passcode: String, salt: Data) -> SymmetricKey {
        let passwordKey = SymmetricKey(data: Data(passcode.utf8))
        var block = Data(salt)
        block.append(contentsOf: [0, 0, 0, 1])
        var result = Data(HMAC<SHA256>.authenticationCode(for: block, using: passwordKey))
        var previous = result

        if iterations > 1 {
            for _ in 2...iterations {
                previous = Data(HMAC<SHA256>.authenticationCode(for: previous, using: passwordKey))
                result = Data(zip(result, previous).map(^))
            }
        }
        return SymmetricKey(data: result)
    }

    private func randomData(count: Int) -> Data {
        var generator = SystemRandomNumberGenerator()
        return Data((0..<count).map { _ in UInt8.random(in: .min ... .max, using: &generator) })
    }

    private struct Envelope: Codable {
        let version: Int
        let iterations: Int
        let salt: String
        let sealed: String
    }
}
