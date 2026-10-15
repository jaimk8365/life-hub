import Foundation

public enum LegacyFinanceImportError: Error, Equatable, LocalizedError {
    case invalidBackup
    case noFinanceData
    case malformedValue(String)

    public var errorDescription: String? {
        switch self {
        case .invalidBackup: "This file is not a LifeHub backup."
        case .noFinanceData: "No Money records were found in this backup."
        case .malformedValue(let key): "The Money record \(key) could not be read."
        }
    }
}

public struct LegacyFinanceImporter: Sendable {
    public init() {}

    public func importBackup(_ data: Data) throws -> MoneyMapSnapshot {
        guard let object = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
              let allKeys = object["keys"] as? [String: Any] else {
            throw LegacyFinanceImportError.invalidBackup
        }

        let finance = allKeys.reduce(into: [String: String]()) { result, pair in
            guard pair.key.hasPrefix("fin_"), let value = pair.value as? String else { return }
            result[pair.key] = value
        }
        guard !finance.isEmpty else { throw LegacyFinanceImportError.noFinanceData }

        return MoneyMapSnapshot(
            accounts: try decode([MoneyAccount].self, key: "fin_accounts", from: finance, default: []),
            transactions: try decode([MoneyTransaction].self, key: "fin_txns", from: finance, default: []),
            bills: try decode([MoneyBill].self, key: "fin_bills", from: finance, default: []),
            legacyValues: finance
        )
    }

    private func decode<T: Decodable>(
        _ type: T.Type,
        key: String,
        from values: [String: String],
        default defaultValue: T
    ) throws -> T {
        guard let raw = values[key] else { return defaultValue }
        guard let data = raw.data(using: .utf8) else {
            throw LegacyFinanceImportError.malformedValue(key)
        }
        do { return try JSONDecoder().decode(type, from: data) }
        catch { throw LegacyFinanceImportError.malformedValue(key) }
    }
}
