import Foundation

/// Any JSON value, kept exactly as it came. The backup blob is stored and round-tripped as
/// this, so keys the iPhone app doesn't understand (yet) are never dropped
/// (SYNC_PLAYBOOK.md section 5, "extras preservation").
enum JSONValue: Codable, Hashable {
    case null
    case bool(Bool)
    case number(Double)
    case string(String)
    case array([JSONValue])
    case object([String: JSONValue])

    init(from decoder: Decoder) throws {
        let c = try decoder.singleValueContainer()
        if c.decodeNil() { self = .null }
        else if let b = try? c.decode(Bool.self) { self = .bool(b) }
        else if let n = try? c.decode(Double.self) { self = .number(n) }
        else if let s = try? c.decode(String.self) { self = .string(s) }
        else if let a = try? c.decode([JSONValue].self) { self = .array(a) }
        else { self = .object(try c.decode([String: JSONValue].self)) }
    }

    func encode(to encoder: Encoder) throws {
        var c = encoder.singleValueContainer()
        switch self {
        case .null: try c.encodeNil()
        case .bool(let b): try c.encode(b)
        case .number(let n): try c.encode(n)
        case .string(let s): try c.encode(s)
        case .array(let a): try c.encode(a)
        case .object(let o): try c.encode(o)
        }
    }

    subscript(key: String) -> JSONValue? {
        if case .object(let o) = self { return o[key] }
        return nil
    }

    var object: [String: JSONValue]? { if case .object(let o) = self { return o }; return nil }
    var array: [JSONValue]? { if case .array(let a) = self { return a }; return nil }
    var string: String? { if case .string(let s) = self { return s }; return nil }
    var bool: Bool? { if case .bool(let b) = self { return b }; return nil }

    /// Lenient like JS: numeric strings count as numbers (`w.sets||0`, `parseFloat`).
    var double: Double? {
        switch self {
        case .number(let n): return n
        case .string(let s): return Double(s)
        case .bool(let b): return b ? 1 : 0
        default: return nil
        }
    }
    var int: Int? { double.flatMap { $0.isFinite ? Int($0) : nil } }
}

extension JSONValue {
    /// JavaScript truthiness (`if (x)`): null, false, 0, NaN and "" are falsy; every array and
    /// object, even an empty one, is truthy. The merge port leans on this to match index.html.
    var truthy: Bool {
        switch self {
        case .null: return false
        case .bool(let b): return b
        case .number(let n): return n != 0 && !n.isNaN
        case .string(let s): return !s.isEmpty
        case .array, .object: return true
        }
    }

    /// `Number(x)` for the cases the blob actually holds (numbers, numeric strings, bools, null).
    var jsNumber: Double {
        switch self {
        case .number(let n): return n
        case .bool(let b): return b ? 1 : 0
        case .null: return 0
        case .string(let s):
            let t = s.trimmingCharacters(in: .whitespacesAndNewlines)
            return t.isEmpty ? 0 : (Double(t) ?? .nan)
        default: return .nan
        }
    }
}

/// JavaScript `x || 0` on an optional JSON number.
func jsNum(_ v: JSONValue?) -> Double {
    guard let v, v.truthy else { return 0 }
    let n = v.jsNumber
    return n.isNaN ? 0 : n
}
