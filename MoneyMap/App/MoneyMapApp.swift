import SwiftUI

@main
struct MoneyMapApp: App {
    @StateObject private var store = MoneyMapStore()

    var body: some Scene {
        WindowGroup {
            RootView()
                .environmentObject(store)
                .tint(MoneyMapTheme.coral)
        }
    }
}
