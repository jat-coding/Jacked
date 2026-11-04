import SwiftUI

/// Login / sign-up, the native version of the PWA's onboarding steps ob0 (Log in) and
/// ob1 (Pick your username). Same copy, same rules, same server calls.
struct AuthView: View {
    @EnvironmentObject private var auth: AuthStore
    @State private var mode: Mode = .login

    enum Mode { case login, signup }

    var body: some View {
        ScrollView {
            VStack(spacing: 0) {
                // .ob-logo: 64pt Barlow Condensed Black, teal, 2pt tracking.
                Text("JACKED.")
                    .font(Theme.heading(64, .black))
                    .tracking(2)
                    .foregroundStyle(Theme.accent)
                    .padding(.bottom, 8)
                Text("Your personal lifting companion")
                    .font(Theme.body(16))
                    .foregroundStyle(Theme.text2)
                    .padding(.bottom, 40)

                Group {
                    switch mode {
                    case .login: LoginForm(switchToSignup: { switchMode(.signup) })
                    case .signup: SignupForm(switchToLogin: { switchMode(.login) })
                    }
                }
                .frame(maxWidth: 380)
            }
            .padding(.horizontal, 24)
            .padding(.vertical, 48)
            .frame(maxWidth: .infinity)
        }
        .scrollDismissesKeyboard(.interactively)
        .background(Theme.bg.ignoresSafeArea())
    }

    private func switchMode(_ m: Mode) {
        auth.message = nil
        withAnimation(.easeOut(duration: 0.2)) { mode = m }
    }
}

private struct LoginForm: View {
    @EnvironmentObject private var auth: AuthStore
    var switchToSignup: () -> Void

    @State private var identifier = ""
    @State private var password = ""
    @FocusState private var focus: Field?
    enum Field { case user, pass }

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            StepTitle("Log in",
                      sub: "Enter your username or email and password to sign in to your account.")

            TextField("", text: $identifier, prompt: Text("@username or email").foregroundColor(Theme.muted))
                .textContentType(.username)
                .textInputAutocapitalization(.never)
                .autocorrectionDisabled()
                .keyboardType(.emailAddress)
                .submitLabel(.next)
                .focused($focus, equals: .user)
                .onSubmit { focus = .pass }
                .modifier(JackedFieldStyle(focused: focus == .user))

            PasswordField(placeholder: "Password", text: $password, isNew: false,
                          focus: $focus, field: .pass)
                .submitLabel(.go)
                .onSubmit(submit)

            FormMessage()

            Button(action: submit) {
                BusyLabel(title: "Log in", busyTitle: "Logging in…")
            }
            .buttonStyle(AccentButtonStyle())
            .disabled(auth.busy)

            SwitchLine(prompt: "Don't have an account?", action: "Sign up", tap: switchToSignup)
        }
    }

    private func submit() {
        focus = nil
        Task { await auth.logIn(identifier: identifier, password: password) }
    }
}

private struct SignupForm: View {
    @EnvironmentObject private var auth: AuthStore
    var switchToLogin: () -> Void

    @State private var username = ""
    @State private var name = ""
    @State private var email = ""
    @State private var password = ""
    @State private var confirm = ""
    @FocusState private var focus: Field?
    enum Field { case user, name, email, pass, confirm }

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            StepTitle("Pick your username", sub: "This is your unique handle — friends add you by it")

            TextField("", text: $username, prompt: Text("@username").foregroundColor(Theme.muted))
                .textContentType(.username)
                .textInputAutocapitalization(.never)
                .autocorrectionDisabled()
                .focused($focus, equals: .user)
                .onSubmit { focus = .name }
                .modifier(JackedFieldStyle(focused: focus == .user))
                .onChange(of: username) { _, v in
                    // Same 20-character cap as the PWA's maxlength, on the handle itself.
                    if v.count > 21 { username = String(v.prefix(21)) }
                }

            TextField("", text: $name, prompt: Text("Display name (shown on leaderboard)").foregroundColor(Theme.muted))
                .textContentType(.name)
                .focused($focus, equals: .name)
                .onSubmit { focus = .email }
                .modifier(JackedFieldStyle(focused: focus == .name))

            TextField("", text: $email, prompt: Text("Email (optional — lets you log in with it too)").foregroundColor(Theme.muted))
                .textContentType(.emailAddress)
                .keyboardType(.emailAddress)
                .textInputAutocapitalization(.never)
                .autocorrectionDisabled()
                .focused($focus, equals: .email)
                .onSubmit { focus = .pass }
                .modifier(JackedFieldStyle(focused: focus == .email))

            PasswordField(placeholder: "Password (8+ characters)", text: $password, isNew: true,
                          focus: $focus, field: .pass)
                .onSubmit { focus = .confirm }

            PasswordField(placeholder: "Confirm password", text: $confirm, isNew: true,
                          focus: $focus, field: .confirm)
                .submitLabel(.go)
                .onSubmit(submit)

            FormMessage()

            Button(action: submit) {
                BusyLabel(title: "Continue →", busyTitle: "Creating account…")
            }
            .buttonStyle(AccentButtonStyle())
            .disabled(auth.busy)

            SwitchLine(prompt: "Already have an account?", action: "Log in", tap: switchToLogin)
        }
    }

    private func submit() {
        focus = nil
        Task {
            await auth.signUp(username: username, name: name, email: email,
                              password: password, confirm: confirm)
        }
    }
}

// MARK: - Pieces

private struct StepTitle: View {
    let title: String
    let sub: String
    init(_ title: String, sub: String) { self.title = title; self.sub = sub }

    var body: some View {
        VStack(spacing: 8) {
            Text(title)
                .font(Theme.heading(22, .bold))
                .foregroundStyle(Theme.text)
            Text(sub)
                .font(Theme.body(13))
                .foregroundStyle(Theme.muted)
                .multilineTextAlignment(.center)
        }
        .frame(maxWidth: .infinity)
        .padding(.bottom, 8)
    }
}

/// Password input with the PWA's eye toggle (.pw-tog).
private struct PasswordField<Field: Hashable>: View {
    let placeholder: String
    @Binding var text: String
    let isNew: Bool
    var focus: FocusState<Field?>.Binding
    let field: Field
    @State private var revealed = false

    var body: some View {
        HStack(spacing: 8) {
            Group {
                if revealed {
                    TextField("", text: $text, prompt: Text(placeholder).foregroundColor(Theme.muted))
                } else {
                    SecureField("", text: $text, prompt: Text(placeholder).foregroundColor(Theme.muted))
                }
            }
            .textContentType(isNew ? .newPassword : .password)
            .textInputAutocapitalization(.never)
            .autocorrectionDisabled()
            .focused(focus, equals: field)

            Button {
                revealed.toggle()
                focus.wrappedValue = field   // the swap replaces the field; keep the keyboard up
            } label: {
                Image(systemName: revealed ? "eye.slash" : "eye")
                    .font(.system(size: 15))
                    .foregroundStyle(Theme.muted)
                    .frame(width: 34, height: 24)
            }
            .buttonStyle(.plain)
            .accessibilityLabel(revealed ? "Hide password" : "Show password")
        }
        .modifier(JackedFieldStyle(focused: focus.wrappedValue == field))
    }
}

/// The PWA's #loginMsg line (orange, 12pt).
private struct FormMessage: View {
    @EnvironmentObject private var auth: AuthStore
    var body: some View {
        if let m = auth.message {
            Text(m)
                .font(Theme.body(12))
                .foregroundStyle(Theme.orange)
                .frame(maxWidth: .infinity, alignment: .leading)
                .transition(.opacity)
        }
    }
}

private struct BusyLabel: View {
    @EnvironmentObject private var auth: AuthStore
    let title: String
    let busyTitle: String
    var body: some View {
        HStack(spacing: 8) {
            if auth.busy { ProgressView().tint(Theme.onAccent) }
            Text(auth.busy ? busyTitle : title)
        }
    }
}

private struct SwitchLine: View {
    let prompt: String
    let action: String
    let tap: () -> Void
    var body: some View {
        HStack(spacing: 4) {
            Text(prompt).foregroundStyle(Theme.muted)
            Button(action, action: tap)
                .foregroundStyle(Theme.accent)
                .fontWeight(.bold)
                .underline()
                .buttonStyle(.plain)
        }
        .font(Theme.body(13))
        .frame(maxWidth: .infinity)
        .padding(.top, 10)
    }
}

#Preview {
    AuthView().environmentObject(AuthStore())
}
