import Foundation
import Testing
@testable import MoneyMapCore

@Test func encryptedVaultRoundTripsWithoutExposingAccountData() throws {
    let plaintext = Data(#"{"account":"Everyday","balance":2259.43}"#.utf8)
    let encrypted = try VaultCrypto(iterations: 100).seal(plaintext, passcode: "correct horse")

    #expect(!String(decoding: encrypted, as: UTF8.self).contains("Everyday"))
    #expect(try VaultCrypto(iterations: 100).open(encrypted, passcode: "correct horse") == plaintext)
}

@Test func encryptedVaultRejectsWrongPasscode() throws {
    let crypto = VaultCrypto(iterations: 100)
    let encrypted = try crypto.seal(Data("private".utf8), passcode: "right")
    #expect(throws: VaultCryptoError.authenticationFailed) {
        try crypto.open(encrypted, passcode: "wrong")
    }
}
