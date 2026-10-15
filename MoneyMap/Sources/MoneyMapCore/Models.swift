import Foundation

public struct MoneyMapSnapshot: Codable, Equatable, Sendable {
    public var accounts: [MoneyAccount]
    public var transactions: [MoneyTransaction]
    public var bills: [MoneyBill]
    public var legacyValues: [String: String]
    public var importedAt: Date

    public init(
        accounts: [MoneyAccount] = [],
        transactions: [MoneyTransaction] = [],
        bills: [MoneyBill] = [],
        legacyValues: [String: String] = [:],
        importedAt: Date = .now
    ) {
        self.accounts = accounts
        self.transactions = transactions
        self.bills = bills
        self.legacyValues = legacyValues
        self.importedAt = importedAt
    }

    public var sourceKeys: [String] { legacyValues.keys.sorted() }

    public func balance(for account: MoneyAccount) -> Double {
        account.openingBalance + transactions
            .filter { $0.accountID == account.id }
            .reduce(0) { $0 + $1.amount }
    }

    public var netWorth: Double {
        accounts.reduce(0) { $0 + balance(for: $1) }
    }
}

public struct MoneyAccount: Codable, Identifiable, Equatable, Sendable {
    public let id: String
    public var name: String
    public var numberSuffix: String
    public var type: AccountType
    public var emoji: String
    public var colorHex: String
    public var openingBalance: Double
    public var openingDate: String
    public var note: String?

    enum CodingKeys: String, CodingKey {
        case id, name, type, emoji, note
        case numberSuffix = "num"
        case colorHex = "color"
        case openingBalance = "openBal"
        case openingDate = "openDate"
    }

    public init(from decoder: Decoder) throws {
        let values = try decoder.container(keyedBy: CodingKeys.self)
        id = try values.decode(String.self, forKey: .id)
        name = try values.decodeIfPresent(String.self, forKey: .name) ?? "Account"
        numberSuffix = try values.decodeIfPresent(String.self, forKey: .numberSuffix) ?? ""
        type = try values.decodeIfPresent(AccountType.self, forKey: .type) ?? .spending
        emoji = try values.decodeIfPresent(String.self, forKey: .emoji) ?? "💰"
        colorHex = try values.decodeIfPresent(String.self, forKey: .colorHex) ?? "#7FB79B"
        openingBalance = try values.decodeIfPresent(Double.self, forKey: .openingBalance) ?? 0
        openingDate = try values.decodeIfPresent(String.self, forKey: .openingDate) ?? ""
        note = try values.decodeIfPresent(String.self, forKey: .note)
    }
}

public enum AccountType: String, Codable, Sendable {
    case spending = "spend"
    case savings = "save"
    case loan
    case other

    public init(from decoder: Decoder) throws {
        let value = try decoder.singleValueContainer().decode(String.self)
        self = AccountType(rawValue: value) ?? .other
    }
}

public struct MoneyTransaction: Codable, Identifiable, Equatable, Sendable {
    public let id: String
    public var accountID: String
    public var amount: Double
    public var category: String
    public var note: String
    public var date: String

    enum CodingKeys: String, CodingKey {
        case id, amount, note, date
        case accountID = "acct"
        case category = "cat"
    }

    public init(from decoder: Decoder) throws {
        let values = try decoder.container(keyedBy: CodingKeys.self)
        id = try values.decode(String.self, forKey: .id)
        accountID = try values.decodeIfPresent(String.self, forKey: .accountID) ?? ""
        amount = try values.decodeIfPresent(Double.self, forKey: .amount) ?? 0
        category = try values.decodeIfPresent(String.self, forKey: .category) ?? "other"
        note = try values.decodeIfPresent(String.self, forKey: .note) ?? "Transaction"
        date = try values.decodeIfPresent(String.self, forKey: .date) ?? ""
    }
}

public struct MoneyBill: Codable, Identifiable, Equatable, Sendable {
    public let id: String
    public var name: String
    public var emoji: String
    public var amount: Double
    public var frequency: BillFrequency
    public var method: String
    public var accountID: String
    public var nextDate: String
    public var note: String
    public var isActive: Bool

    enum CodingKeys: String, CodingKey {
        case id, name, emoji, amount, frequency, method, note
        case accountID = "acct"
        case nextDate = "anchor"
        case isActive = "active"
    }

    public init(from decoder: Decoder) throws {
        let values = try decoder.container(keyedBy: CodingKeys.self)
        id = try values.decode(String.self, forKey: .id)
        name = try values.decodeIfPresent(String.self, forKey: .name) ?? "Bill"
        emoji = try values.decodeIfPresent(String.self, forKey: .emoji) ?? "📄"
        amount = try values.decodeIfPresent(Double.self, forKey: .amount) ?? 0
        frequency = try values.decodeIfPresent(BillFrequency.self, forKey: .frequency) ?? .monthly
        method = try values.decodeIfPresent(String.self, forKey: .method) ?? ""
        accountID = try values.decodeIfPresent(String.self, forKey: .accountID) ?? ""
        nextDate = try values.decodeIfPresent(String.self, forKey: .nextDate) ?? ""
        note = try values.decodeIfPresent(String.self, forKey: .note) ?? ""
        isActive = try values.decodeIfPresent(Bool.self, forKey: .isActive) ?? true
    }
}

public enum BillFrequency: String, Codable, Sendable {
    case weekly, fortnightly, monthly, quarterly, yearly, once, other

    public init(from decoder: Decoder) throws {
        let value = try decoder.singleValueContainer().decode(String.self)
        self = BillFrequency(rawValue: value) ?? .other
    }
}
