import Foundation

public struct FinancePrivacyPolicy: Sendable {
    public static let partnerSharedKeys: Set<String> = [
        "fin_income_v1",
        "fin_budget_v3",
        "fin_catbudget_v2",
        "fin_buffers",
        "fin_week_plan_v2",
        "fin_tax_v1",
        "fin_shared_goals_v1",
        "fin_matthew_changes_v1"
    ]

    public init() {}

    public func valuesForMatthew(from ownerValues: [String: String]) -> [String: String] {
        ownerValues.filter { Self.partnerSharedKeys.contains($0.key) }
    }
}

public struct SharedFinancePayload: Codable, Equatable, Sendable {
    public var accounts: [MoneyAccount]
    public var transactions: [MoneyTransaction]
    public var bills: [MoneyBill]
    public var sharedValues: [String: String]
    public var updatedAt: Date

    public init(ownerSnapshot: MoneyMapSnapshot, updatedAt: Date = .now) {
        let sharedAccountIDs = Set(ownerSnapshot.accounts.filter { !$0.id.hasPrefix("jspend") }.map(\.id))
        accounts = ownerSnapshot.accounts.filter { sharedAccountIDs.contains($0.id) }
        transactions = ownerSnapshot.transactions.filter { sharedAccountIDs.contains($0.accountID) }
        bills = ownerSnapshot.bills
        sharedValues = FinancePrivacyPolicy().valuesForMatthew(from: ownerSnapshot.legacyValues)
        self.updatedAt = updatedAt
    }
}
