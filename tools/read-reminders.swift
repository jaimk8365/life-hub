import EventKit
import Foundation

struct ReminderRow: Codable {
    let title: String
    let list: String
    let due: String?
    let priority: Int
}

let store = EKEventStore()
let semaphore = DispatchSemaphore(value: 0)
var granted = false
var accessError: Error?

if #available(macOS 14.0, *) {
    store.requestFullAccessToReminders { ok, error in
        granted = ok
        accessError = error
        semaphore.signal()
    }
} else {
    store.requestAccess(to: .reminder) { ok, error in
        granted = ok
        accessError = error
        semaphore.signal()
    }
}

_ = semaphore.wait(timeout: .now() + 20)
guard granted else {
    fputs("Reminder access was not granted: \(accessError?.localizedDescription ?? "unknown error")\n", stderr)
    exit(2)
}

let wanted = Set((ProcessInfo.processInfo.environment["LIFEHUB_LISTS"] ?? "")
    .split(separator: "\n").map { String($0).trimmingCharacters(in: .whitespacesAndNewlines).lowercased() })
let calendars = store.calendars(for: .reminder).filter { wanted.isEmpty || wanted.contains($0.title.lowercased()) }
let predicate = store.predicateForIncompleteReminders(withDueDateStarting: nil, ending: nil, calendars: calendars)
var rows: [ReminderRow] = []
let fetchSemaphore = DispatchSemaphore(value: 0)
let formatter = ISO8601DateFormatter()

store.fetchReminders(matching: predicate) { reminders in
    rows = (reminders ?? []).map { reminder in
        let due = reminder.dueDateComponents.flatMap { Calendar.current.date(from: $0) }.map { formatter.string(from: $0) }
        return ReminderRow(title: reminder.title, list: reminder.calendar.title, due: due, priority: reminder.priority)
    }
    fetchSemaphore.signal()
}

guard fetchSemaphore.wait(timeout: .now() + 30) == .success else {
    fputs("Timed out reading reminders.\n", stderr)
    exit(3)
}

let encoder = JSONEncoder()
encoder.outputFormatting = [.sortedKeys]
FileHandle.standardOutput.write(try encoder.encode(rows))
