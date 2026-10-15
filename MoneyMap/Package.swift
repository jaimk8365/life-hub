// swift-tools-version: 6.0
import PackageDescription

let package = Package(
    name: "MoneyMapCore",
    platforms: [
        .iOS(.v17),
        .macOS(.v14)
    ],
    products: [
        .library(name: "MoneyMapCore", targets: ["MoneyMapCore"])
    ],
    targets: [
        .target(name: "MoneyMapCore"),
        .testTarget(name: "MoneyMapCoreTests", dependencies: ["MoneyMapCore"])
    ]
)
