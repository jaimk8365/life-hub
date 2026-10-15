import SwiftUI

enum MoneyMapTheme {
    static let coral = Color(red: 0.91, green: 0.57, blue: 0.49)
    static let gold = Color(red: 0.90, green: 0.72, blue: 0.33)
    static let green = Color(red: 0.50, green: 0.72, blue: 0.61)
    static let ink = Color(red: 0.17, green: 0.15, blue: 0.13)
    static let paper = Color(red: 0.97, green: 0.95, blue: 0.92)
}

extension Double {
    var aud: String {
        formatted(.currency(code: "AUD").presentation(.narrow).precision(.fractionLength(2)))
    }
}
