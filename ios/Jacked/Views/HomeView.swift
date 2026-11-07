import SwiftUI

/// The PWA's #page-home, read-only: streak banner, month calendar (tap a day), Start Workout,
/// recent workouts (tap for details). Everything is computed from the synced blob.
struct HomeView: View {
    @EnvironmentObject private var auth: AuthStore
    @EnvironmentObject private var store: BackupStore
    @State private var month = Calendar.current.dateComponents([.year, .month], from: Date())
    @State private var dayKey: DayKey?
    @State private var workout: Workout?
    @State private var showAccount = false
    @State private var showStartNote = false

    struct DayKey: Identifiable { let id: String }

    var body: some View {
        let h = store.backup.history
        let settings = store.backup.settings
        ScrollView {
            VStack(spacing: 0) {
                PageHeader(title: "JACKED") {
                    Button { showAccount = true } label: {
                        AvatarBadge(name: store.backup.profileName, url: store.backup.avatarURL)
                    }
                    .accessibilityLabel("Profile")
                }
                syncLine
                StreakBanner(history: h).padding(.bottom, 20)
                CalendarCard(history: h, month: $month) { dayKey = DayKey(id: $0) }
                    .padding(.bottom, 20)
                Button { showStartNote = true } label: {
                    Label("Start Workout", systemImage: "play.fill").font(Theme.body(16, .semibold))
                }
                .buttonStyle(AccentButtonStyle())
                .padding(.bottom, 22)
                RecentWorkouts(history: h, settings: settings) { workout = $0 }
                Text("Jacked for iPhone, preview build")
                    .font(Theme.body(11))
                    .foregroundStyle(Theme.muted)
                    .padding(.top, 22).padding(.bottom, 6)
            }
            .padding(.horizontal, 16)
        }
        .scrollIndicators(.hidden)
        .background(Theme.bg.ignoresSafeArea())
        .refreshable { await store.refresh(auth: auth) }
        .onChange(of: store.loadedCode) { _, code in
            guard code != nil else { return }
            if let r = DevHooks.rename {
                let rec = Array(h.reversed())
                if rec.indices.contains(r.index), let id = rec[r.index].rawId {
                    Task {
                        await store.renameWorkout(id: id, to: r.name, auth: auth)
                        workout = store.backup.history.reversed().dropFirst(r.index).first
                    }
                }
                return
            }
            guard let o = DevHooks.open else { return }
            if o == "profile" { showAccount = true }
            else if o.hasPrefix("day:") {
                let d = String(o.dropFirst(4)); dayKey = DayKey(id: d == "today" ? JackedDate.dayKey(Date()) : d)
            } else if o.hasPrefix("workout:"), let i = Int(o.dropFirst(8)) {
                let rec = Array(h.reversed()); if rec.indices.contains(i) { workout = rec[i] }
            }
        }
        .sheet(item: $dayKey) { d in
            DaySheet(dayKey: d.id, workouts: h.filter { $0.dayKey == d.id }, settings: settings) { w in
                dayKey = nil
                DispatchQueue.main.asyncAfter(deadline: .now() + 0.35) { workout = w }
            }
        }
        .sheet(item: $workout) { WorkoutDetailSheet(workout: $0, settings: settings) }
        .sheet(isPresented: $showAccount) { AccountSheet() }
        .alert("Workout logging is the next build step", isPresented: $showStartNote) {
            Button("OK", role: .cancel) {}
        } message: {
            Text("This preview can rename a past workout but can't log a new one yet.")
        }
    }

    @ViewBuilder private var syncLine: some View {
        if case .failed(let msg) = store.state {
            Text(msg).font(Theme.body(12)).foregroundStyle(Theme.orange)
                .frame(maxWidth: .infinity, alignment: .leading).padding(.bottom, 10)
        } else if store.state == .syncing && store.loadedCode == nil {
            ProgressView().tint(Theme.accent).padding(.bottom, 10)
        }
    }
}

/// #streakBanner: only shown while a streak is live (Mr. Roni, 2026-09-26).
struct StreakBanner: View {
    let history: [Workout]

    var body: some View {
        let streak = HomeMath.streak(history)
        if streak > 0 {
            let best = max(HomeMath.bestStreak(history), streak)
            VStack(alignment: .leading, spacing: 0) {
                BlockTitle(text: "Streak")
                HStack(alignment: .center, spacing: 14) {
                    Image(systemName: "flame").font(.system(size: 28, weight: .semibold)).foregroundStyle(Theme.orange)
                    VStack(alignment: .leading, spacing: 4) {
                        Text("\(streak) day\(streak == 1 ? "" : "s")")
                            .font(Theme.heading(30, .black)).foregroundStyle(Theme.text)
                        Text("CURRENT \u{2014} KEEP IT ALIVE").font(Theme.body(11, .semibold)).tracking(0.8).foregroundStyle(Theme.muted)
                    }
                    Spacer(minLength: 0)
                    Text("Best \(best)d")
                        .font(Theme.body(11, .semibold)).foregroundStyle(Theme.muted)
                        .padding(.horizontal, 9).padding(.vertical, 3)
                        .overlay(Capsule().stroke(Theme.border2, lineWidth: 1))
                        .frame(maxHeight: .infinity, alignment: .top)
                }
                .fixedSize(horizontal: false, vertical: true)
            }
            .padding(18)
            .card()
        }
    }
}

/// .cw calendar: month label, prev/next, a 7-column grid. Trained days teal with a dot,
/// missed past days faint red, today outlined, future days muted (index.html renderCal).
struct CalendarCard: View {
    let history: [Workout]
    @Binding var month: DateComponents
    var onDay: (String) -> Void

    private let cal = Calendar.current
    private static let months = ["January", "February", "March", "April", "May", "June", "July",
                                 "August", "September", "October", "November", "December"]

    var body: some View {
        let y = month.year!, m = month.month!
        let trained = Set(history.map(\.dayKey))
        let today = JackedDate.dayKey(Date())
        let first = cal.date(from: DateComponents(year: y, month: m, day: 1))!
        let lead = cal.component(.weekday, from: first) - 1
        let dim = cal.range(of: .day, in: .month, for: first)!.count
        VStack(spacing: 10) {
            HStack {
                navButton("chevron.left") { shift(-1) }
                Spacer()
                Text("\(Self.months[m - 1]) \(String(y))").font(Theme.heading(19, .bold)).foregroundStyle(Theme.text)
                Spacer()
                navButton("chevron.right") { shift(1) }
            }
            LazyVGrid(columns: Array(repeating: GridItem(.flexible(), spacing: 3), count: 7), spacing: 3) {
                ForEach(Array(["S", "M", "T", "W", "T", "F", "S"].enumerated()), id: \.offset) { i, d in
                    Text(d).font(.system(size: 9, weight: .bold)).foregroundStyle(Theme.muted).padding(.vertical, 3)
                        .id("h\(i)")
                }
                // One ForEach with unique ids: separate ForEach blocks keyed by overlapping
                // integers made the grid drop the first days of the month.
                ForEach(-lead..<dim, id: \.self) { i in
                    if i < 0 {
                        Color.clear.aspectRatio(1, contentMode: .fit)
                    } else {
                        let d = i + 1
                        let ds = String(format: "%04d-%02d-%02d", y, m, d)
                        dayCell(d, isToday: ds == today, isFuture: ds > today, worked: trained.contains(ds))
                            .contentShape(Rectangle())
                            .onTapGesture { onDay(ds) }
                    }
                }
            }
        }
        .padding(14)
        .card()
    }

    private func dayCell(_ d: Int, isToday: Bool, isFuture: Bool, worked: Bool) -> some View {
        let bg: Color = isFuture ? .clear : worked ? Theme.accent.opacity(0.2) : isToday ? .clear : Color(hex: 0xFF4D4D).opacity(0.07)
        let fg: Color = isFuture ? Theme.muted : worked || isToday ? Theme.accent : Color(hex: 0xFF4D4D).opacity(0.4)
        return ZStack(alignment: .bottom) {
            RoundedRectangle(cornerRadius: 6).fill(bg)
            if isToday { RoundedRectangle(cornerRadius: 6).stroke(Theme.accent, lineWidth: 1.5) }
            Text("\(d)")
                .font(.system(size: 11, weight: worked && !isFuture ? .bold : .medium))
                .foregroundStyle(fg)
                .frame(maxWidth: .infinity, maxHeight: .infinity)
            if worked && !isFuture { Circle().fill(Theme.accent).frame(width: 3, height: 3).padding(.bottom, 2) }
        }
        .aspectRatio(1, contentMode: .fit)
    }

    private func navButton(_ icon: String, _ action: @escaping () -> Void) -> some View {
        Button(action: action) {
            Image(systemName: icon).font(.system(size: 13, weight: .semibold)).foregroundStyle(Theme.text2)
                .frame(width: 30, height: 30).background(Theme.bg4, in: RoundedRectangle(cornerRadius: 8))
        }
    }

    private func shift(_ by: Int) {
        let d = cal.date(byAdding: .month, value: by, to: cal.date(from: month)!)!
        month = cal.dateComponents([.year, .month], from: d)
    }
}

/// #recentW: the last 6 workouts, newest first.
struct RecentWorkouts: View {
    let history: [Workout]
    let settings: Settings
    var onTap: (Workout) -> Void

    var body: some View {
        VStack(spacing: 0) {
            BlockTitle(text: "Recent workouts")
            let rec = Array(history.reversed().prefix(6))
            if rec.isEmpty {
                VStack(spacing: 6) {
                    Text("No workouts yet").font(Theme.heading(20, .bold)).foregroundStyle(Theme.text)
                    Text("Tap Log to start your first session.").font(Theme.body(13)).foregroundStyle(Theme.muted)
                }
                .padding(.vertical, 30)
            } else {
                ForEach(rec) { w in
                    Button { onTap(w) } label: { WorkoutRow(workout: w, settings: settings) }
                        .buttonStyle(.plain)
                        .padding(.bottom, 8)
                }
            }
        }
    }
}

/// .wli row: first exercise's photo, name, "date · duration · N sets", volume on the right.
/// A run (no lifting volume, some distance) shows miles and pace instead.
struct WorkoutRow: View {
    let workout: Workout
    let settings: Settings

    var body: some View {
        let w = workout
        let isRun = w.totalVolume <= 0 && w.distance > 0
        let meta = isRun && w.pace > 0
            ? "\(JackedDate.short(w.date)) \u{00B7} \(w.duration) \u{00B7} \(HomeMath.fmtPace(w.pace))"
            : "\(JackedDate.short(w.date)) \u{00B7} \(w.duration) \u{00B7} \(w.sets) sets"
        HStack(spacing: 12) {
            ExerciseThumb(exercise: w.exercises.first, size: 46)
            VStack(alignment: .leading, spacing: 2) {
                Text(w.name).font(Theme.body(14, .semibold)).foregroundStyle(Theme.text).lineLimit(1)
                Text(meta).font(Theme.body(11)).foregroundStyle(Theme.muted).lineLimit(1)
            }
            Spacer(minLength: 4)
            VStack(alignment: .trailing, spacing: 0) {
                Text(isRun ? HomeMath.miles(w.distance) : HomeMath.fmtV(settings.display(w.totalVolume)))
                    .font(Theme.heading(18, .bold)).foregroundStyle(Theme.text2)
                Text(isRun ? "mi" : settings.unitLabel).font(.system(size: 9)).foregroundStyle(Theme.muted)
            }
        }
        .padding(12)
        .card(fill: Theme.bg3, radius: Theme.radius)
        .contentShape(Rectangle())
    }
}

struct ExerciseThumb: View {
    let exercise: WorkoutExercise?
    let size: CGFloat

    var body: some View {
        Group {
            if let url = exercise?.imageURL {
                AsyncImage(url: url) { img in img.resizable().scaledToFill() } placeholder: { fallback }
            } else { fallback }
        }
        .frame(width: size, height: size)
        .clipShape(RoundedRectangle(cornerRadius: 8))
    }

    private var fallback: some View {
        ZStack {
            Theme.bg4
            Image(systemName: "dumbbell").font(.system(size: size * 0.38)).foregroundStyle(Theme.muted)
        }
    }
}

/// The header photo button: profile photo, else initials on teal like the PWA's setHomeAv().
struct AvatarBadge: View {
    let name: String?
    let url: URL?

    var body: some View {
        ZStack {
            Circle().fill(Theme.accent)
            Text(initials).font(Theme.heading(17, .black)).foregroundStyle(Theme.onAccent)
            if let url {
                AsyncImage(url: url) { $0.resizable().scaledToFill() } placeholder: { Color.clear }
                    .clipShape(Circle())
            }
        }
        .frame(width: 44, height: 44)
    }

    private var initials: String {
        let parts = (name ?? "").split(separator: " ").prefix(2)
        let s = parts.compactMap(\.first).map { String($0).uppercased() }.joined()
        return s.isEmpty ? "?" : s
    }
}
