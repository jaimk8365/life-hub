# Money Map

Money Map is the private Apple-native successor to the Finance section in LifeHub. One SwiftUI project supports iPhone, iPad, and Mac Catalyst.

## Current first build

- Passcode-encrypted local vault (PBKDF2-HMAC-SHA256, 300,000 iterations, then AES-256-GCM)
- Face ID, Touch ID, or device-passcode unlock through Apple Keychain
- Money overview, accounts, transactions, and bills
- Import of `fin_*` records from a LifeHub JSON backup
- Retention of the complete imported `fin_*` payload for later feature migrations

The existing LifeHub Finance section is intentionally still active. Remove it only after a real backup has been imported, record totals have been checked, and Money Map has been tested on Jaimi's devices.

## Open and test

Open `MoneyMap.xcodeproj` in Xcode. Choose the **MoneyMap** scheme and an iPhone, iPad, or **My Mac (Mac Catalyst)** destination.

The shared migration and encryption tests run with:

```sh
swift test
```

## Private distribution

Use automatic signing with Jaimi's Apple Developer team. Test on personal devices first, then upload a private beta through TestFlight. Do not add real financial exports, passwords, access tokens, signing certificates, or vault files to this repository.
