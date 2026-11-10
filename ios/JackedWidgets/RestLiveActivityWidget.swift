import ActivityKit
import SwiftUI
import WidgetKit

/// Lock Screen banner + Dynamic Island for the rest timer. Colours are the app's Theme values
/// (the extension does not link Theme.swift); fonts are the system's, since the bundled
/// Barlow / DM Sans files live in the app target.
private enum C {
    static let accent = Color(red: 0x20 / 255, green: 0xD3 / 255, blue: 0xC2 / 255)
    static let bg2 = Color(red: 0x16 / 255, green: 0x16 / 255, blue: 0x1C / 255)
    static let text = Color(red: 0xF3 / 255, green: 0xF3 / 255, blue: 0xF8 / 255)
    static let muted = Color(red: 0x70 / 255, green: 0x70 / 255, blue: 0x7F / 255)
}

private func countdown(_ end: Date, size: CGFloat) -> some View {
    // timerInterval needs lower <= upper; an already-finished rest shows 0:00.
    Text(timerInterval: Date.now...max(end, Date.now), countsDown: true)
        .font(.system(size: size, weight: .black).monospacedDigit())
        .foregroundStyle(C.accent)
        .multilineTextAlignment(.trailing)
}

struct RestLiveActivityWidget: Widget {
    var body: some WidgetConfiguration {
        ActivityConfiguration(for: RestActivityAttributes.self) { ctx in
            HStack(spacing: 12) {
                VStack(alignment: .leading, spacing: 2) {
                    Text("REST").font(.system(size: 11, weight: .bold)).tracking(0.6).foregroundStyle(C.muted)
                    Text(ctx.attributes.workoutName).font(.system(size: 14, weight: .semibold)).foregroundStyle(C.text).lineLimit(1)
                }
                Spacer()
                countdown(ctx.state.endsAt, size: 38)
            }
            .padding(.horizontal, 18).padding(.vertical, 14)
            .activityBackgroundTint(C.bg2)
            .activitySystemActionForegroundColor(C.accent)
        } dynamicIsland: { ctx in
            DynamicIsland {
                DynamicIslandExpandedRegion(.leading) {
                    Text("REST").font(.system(size: 12, weight: .bold)).tracking(0.6).foregroundStyle(C.muted).padding(.leading, 4)
                }
                DynamicIslandExpandedRegion(.trailing) { countdown(ctx.state.endsAt, size: 30).padding(.trailing, 4) }
                DynamicIslandExpandedRegion(.bottom) {
                    Text(ctx.attributes.workoutName).font(.system(size: 13, weight: .semibold)).foregroundStyle(C.text).lineLimit(1)
                }
            } compactLeading: {
                Text("REST").font(.system(size: 11, weight: .bold)).foregroundStyle(C.accent)
            } compactTrailing: {
                countdown(ctx.state.endsAt, size: 13).frame(width: 44)
            } minimal: {
                Image(systemName: "timer").foregroundStyle(C.accent)
            }
            .keylineTint(C.accent)
        }
    }
}
