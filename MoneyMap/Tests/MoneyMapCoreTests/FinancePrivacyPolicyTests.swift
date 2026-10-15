import Testing
@testable import MoneyMapCore

@Test func husbandShareContainsOnlyExistingPartnerWhitelist() {
    let values = [
        "fin_income_v1": "income",
        "fin_budget_v3": "budget",
        "fin_week_plan_v2": "week",
        "fin_tax_v1": "shared tax",
        "fin_shared_goals_v1": "goals",
        "fin_private_debt_lock_v1": "secret",
        "fin_tax_receipt_files_v1": "private files",
        "fin_payoff": "private debts",
        "fin_txns": "full transaction history"
    ]

    let shared = FinancePrivacyPolicy().valuesForMatthew(from: values)

    #expect(shared == [
        "fin_budget_v3": "budget",
        "fin_income_v1": "income",
        "fin_shared_goals_v1": "goals",
        "fin_tax_v1": "shared tax",
        "fin_week_plan_v2": "week"
    ])
    #expect(shared["fin_private_debt_lock_v1"] == nil)
    #expect(shared["fin_tax_receipt_files_v1"] == nil)
    #expect(shared["fin_payoff"] == nil)
    #expect(shared["fin_txns"] == nil)
}
