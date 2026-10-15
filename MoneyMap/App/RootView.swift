import SwiftUI
import UniformTypeIdentifiers

struct RootView: View {
    @EnvironmentObject private var store: MoneyMapStore

    var body: some View {
        Group {
            if store.isUnlocked { MainTabView() }
            else { LockView() }
        }
        .background(MoneyMapTheme.paper.ignoresSafeArea())
        .alert("Money Map", isPresented: Binding(
            get: { store.message != nil },
            set: { if !$0 { store.message = nil } }
        )) {
            Button("OK") { store.message = nil }
        } message: {
            Text(store.message ?? "")
        }
    }
}

private struct LockView: View {
    @EnvironmentObject private var store: MoneyMapStore
    @State private var passcode = ""
    @State private var confirmation = ""

    var body: some View {
        VStack(spacing: 20) {
            RoundedRectangle(cornerRadius: 22)
                .fill(LinearGradient(colors: [MoneyMapTheme.coral, MoneyMapTheme.gold], startPoint: .topLeading, endPoint: .bottomTrailing))
                .frame(width: 76, height: 76)
                .overlay(Image(systemName: "map.fill").font(.system(size: 32)).foregroundStyle(.white))
            Text("Money Map").font(.largeTitle.bold())
            Text(store.vaultExists ? "Your financial map is locked." : "Create your private encrypted vault.")
                .foregroundStyle(.secondary)

            SecureField("Passcode", text: $passcode)
                .textFieldStyle(.roundedBorder)
            if !store.vaultExists {
                SecureField("Confirm passcode", text: $confirmation)
                    .textFieldStyle(.roundedBorder)
            }

            Button(store.vaultExists ? "Unlock" : "Create Money Map") {
                Task {
                    if store.vaultExists { await store.unlock(passcode: passcode) }
                    else if passcode == confirmation { await store.createVault(passcode: passcode) }
                    else { store.message = "The passcodes do not match." }
                }
            }
            .buttonStyle(.borderedProminent)
            .disabled(passcode.isEmpty || (!store.vaultExists && confirmation.isEmpty))

            if store.vaultExists && store.canUseBiometrics {
                Button("Unlock with Face ID or Touch ID") {
                    Task { await store.unlockWithBiometrics() }
                }
                .buttonStyle(.bordered)
            }
        }
        .padding(32)
        .frame(maxWidth: 440)
    }
}

private struct MainTabView: View {
    var body: some View {
        TabView {
            DashboardView().tabItem { Label("Map", systemImage: "map.fill") }
            AccountsView().tabItem { Label("Accounts", systemImage: "creditcard.fill") }
            TransactionsView().tabItem { Label("Activity", systemImage: "list.bullet.rectangle") }
            BillsView().tabItem { Label("Bills", systemImage: "calendar") }
            SettingsView().tabItem { Label("Settings", systemImage: "gearshape.fill") }
        }
    }
}

private struct DashboardView: View {
    @EnvironmentObject private var store: MoneyMapStore

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 18) {
                    Text("Your money, mapped clearly").font(.title2.bold())
                    VStack(alignment: .leading, spacing: 8) {
                        Text("NET WORTH").font(.caption.bold()).foregroundStyle(.secondary)
                        Text(store.snapshot.netWorth.aud).font(.system(size: 40, weight: .bold, design: .rounded))
                    }
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .padding(22)
                    .background(MoneyMapTheme.ink, in: RoundedRectangle(cornerRadius: 24))
                    .foregroundStyle(.white)

                    if store.snapshot.accounts.isEmpty {
                        ContentUnavailableView("Ready for your Money data", systemImage: "square.and.arrow.down", description: Text("Import a LifeHub backup from Settings."))
                    } else {
                        Text("Accounts").font(.headline)
                        ForEach(store.snapshot.accounts) { account in
                            AccountRow(account: account, balance: store.snapshot.balance(for: account))
                        }
                    }
                }
                .padding()
                .frame(maxWidth: 760)
                .frame(maxWidth: .infinity)
            }
            .navigationTitle("Money Map")
        }
    }
}

private struct AccountsView: View {
    @EnvironmentObject private var store: MoneyMapStore
    var body: some View {
        NavigationStack {
            List(store.snapshot.accounts) { account in
                AccountRow(account: account, balance: store.snapshot.balance(for: account))
            }
            .overlay { if store.snapshot.accounts.isEmpty { ContentUnavailableView("No accounts yet", systemImage: "creditcard", description: Text("Import your LifeHub backup in Settings.")) } }
            .navigationTitle("Accounts")
        }
    }
}

private struct AccountRow: View {
    let account: MoneyAccount
    let balance: Double
    var body: some View {
        HStack(spacing: 14) {
            Text(account.emoji).font(.title2).frame(width: 44, height: 44).background(MoneyMapTheme.paper, in: RoundedRectangle(cornerRadius: 14))
            VStack(alignment: .leading) {
                Text(account.name).font(.headline)
                if !account.numberSuffix.isEmpty { Text("••\(account.numberSuffix)").font(.caption).foregroundStyle(.secondary) }
            }
            Spacer()
            Text(balance.aud).font(.headline.monospacedDigit())
        }
        .padding(.vertical, 5)
    }
}

private struct TransactionsView: View {
    @EnvironmentObject private var store: MoneyMapStore
    var body: some View {
        NavigationStack {
            List(store.snapshot.transactions.sorted { $0.date > $1.date }) { transaction in
                HStack {
                    VStack(alignment: .leading) {
                        Text(transaction.note).font(.headline)
                        Text("\(transaction.date) · \(transaction.category.capitalized)").font(.caption).foregroundStyle(.secondary)
                    }
                    Spacer()
                    Text(transaction.amount.aud).foregroundStyle(transaction.amount < 0 ? .primary : MoneyMapTheme.green).monospacedDigit()
                }
            }
            .overlay { if store.snapshot.transactions.isEmpty { ContentUnavailableView("No activity yet", systemImage: "list.bullet.rectangle", description: Text("Transactions will appear after import.")) } }
            .navigationTitle("Activity")
        }
    }
}

private struct BillsView: View {
    @EnvironmentObject private var store: MoneyMapStore
    var body: some View {
        NavigationStack {
            List(store.snapshot.bills.filter(\.isActive).sorted { $0.nextDate < $1.nextDate }) { bill in
                HStack {
                    Text(bill.emoji).font(.title2)
                    VStack(alignment: .leading) {
                        Text(bill.name).font(.headline)
                        Text("Next: \(bill.nextDate) · \(bill.frequency.rawValue.capitalized)").font(.caption).foregroundStyle(.secondary)
                    }
                    Spacer()
                    Text(bill.amount.aud).font(.headline.monospacedDigit())
                }
            }
            .overlay { if store.snapshot.bills.isEmpty { ContentUnavailableView("No bills yet", systemImage: "calendar", description: Text("Bills will appear after import.")) } }
            .navigationTitle("Bills")
        }
    }
}

private struct SettingsView: View {
    @EnvironmentObject private var store: MoneyMapStore
    @State private var choosingBackup = false

    var body: some View {
        NavigationStack {
            Form {
                Section("Move from LifeHub") {
                    Button("Import LifeHub backup") { choosingBackup = true }
                    Text("Imports only Finance records. Your original LifeHub data is not changed.")
                        .font(.caption).foregroundStyle(.secondary)
                }
                Section("Privacy") {
                    Label("Encrypted on this device", systemImage: "lock.shield.fill")
                    Label("Passcode stored in Apple Keychain", systemImage: "key.fill")
                    Button("Lock now") { store.lock() }
                }
                if !store.snapshot.sourceKeys.isEmpty {
                    Section("Imported data") {
                        LabeledContent("Accounts", value: "\(store.snapshot.accounts.count)")
                        LabeledContent("Transactions", value: "\(store.snapshot.transactions.count)")
                        LabeledContent("Bills", value: "\(store.snapshot.bills.count)")
                    }
                }
            }
            .navigationTitle("Settings")
            .fileImporter(isPresented: $choosingBackup, allowedContentTypes: [.json]) { result in
                if case .success(let url) = result { Task { await store.importLifeHubBackup(from: url) } }
                else if case .failure(let error) = result { store.message = error.localizedDescription }
            }
        }
    }
}
