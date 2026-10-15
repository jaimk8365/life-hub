import Foundation
import Testing
@testable import MoneyMapCore

@Test func importsFinanceRecordsAndExcludesOtherLifeHubData() throws {
    let backup = #"""
    {
      "exportedAt": "2026-09-06T00:00:00Z",
      "keys": {
        "fin_accounts": "[{\"id\":\"everyday\",\"name\":\"Everyday\",\"num\":\"2015\",\"type\":\"spend\",\"emoji\":\"🛒\",\"color\":\"#7FB79B\",\"openBal\":2259.43,\"openDate\":\"2026-06-30\"}]",
        "fin_txns": "[{\"id\":\"txn-1\",\"acct\":\"everyday\",\"amount\":-42.50,\"cat\":\"groceries\",\"note\":\"Groceries\",\"date\":\"2026-09-05\"}]",
        "fin_bills": "[{\"id\":\"bill-1\",\"name\":\"Internet\",\"emoji\":\"📡\",\"amount\":147.50,\"frequency\":\"monthly\",\"method\":\"debit\",\"acct\":\"everyday\",\"anchor\":\"2026-09-12\",\"active\":true}]",
        "home_tasks": "[{\"id\":\"not-money\"}]"
      }
    }
    """#

    let snapshot = try LegacyFinanceImporter().importBackup(Data(backup.utf8))

    #expect(snapshot.accounts.count == 1)
    #expect(snapshot.accounts.first?.name == "Everyday")
    #expect(snapshot.transactions.count == 1)
    #expect(snapshot.transactions.first?.amount == -42.50)
    #expect(snapshot.bills.count == 1)
    #expect(snapshot.bills.first?.name == "Internet")
    #expect(snapshot.sourceKeys == ["fin_accounts", "fin_bills", "fin_txns"])
}

@Test func rejectsBackupWithoutFinanceData() throws {
    let backup = Data("{\"keys\":{\"home_tasks\":\"[]\"}}".utf8)
    #expect(throws: LegacyFinanceImportError.noFinanceData) {
        try LegacyFinanceImporter().importBackup(backup)
    }
}
