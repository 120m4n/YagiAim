import SwiftUI
import UIKit

/// Paleta tomada del logo: azul marino de fondo, azul brillante para controles
/// y naranja solo para el objetivo (repetidor, aguja, línea de apuntamiento).
enum Theme {
    static let navyUI = UIColor(red: 0.004, green: 0.098, blue: 0.286, alpha: 1)   // #011949
    static let accentUI = UIColor(red: 0.18, green: 0.55, blue: 1.0, alpha: 1)      // #2E8CFF
    static let targetUI = UIColor(red: 1.0, green: 0.62, blue: 0.10, alpha: 1)      // #FF9E1A

    static let navy = Color(uiColor: navyUI)
    static let accent = Color(uiColor: accentUI)
    static let target = Color(uiColor: targetUI)
}
