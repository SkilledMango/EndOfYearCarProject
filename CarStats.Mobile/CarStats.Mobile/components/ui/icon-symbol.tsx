// Fallback for using MaterialIcons on Android and web.

import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { SymbolWeight, SymbolViewProps } from 'expo-symbols';
import { ComponentProps } from 'react';
import { OpaqueColorValue, type StyleProp, type TextStyle } from 'react-native';

type IconMapping = Record<SymbolViewProps['name'], ComponentProps<typeof MaterialIcons>['name']>;
type IconSymbolName = keyof typeof MAPPING;

/**
 * Add your SF Symbols to Material Icons mappings here.
 * - see Material Icons in the [Icons Directory](https://icons.expo.fyi).
 * - see SF Symbols in the [SF Symbols](https://developer.apple.com/sf-symbols/) app.
 */
const MAPPING = {
  'house.fill': 'home',
  'clock.fill': 'history',
  'fuelpump.fill': 'local-gas-station',
  'paperplane.fill': 'send',
  'chevron.left.forwardslash.chevron.right': 'code',
  'chevron.right': 'chevron-right',
  'location.fill': 'place',        // was missing — Navigate tab icon broke on Android
  'person.fill': 'person',         // Profile tab
  'plus': 'add',                   // Fuel screen FAB
  'arrow.down': 'arrow-downward',  // Fuel trend (improving)
  'arrow.up': 'arrow-upward',      // Fuel trend (worsening)
  'car.fill': 'directions-car',    // Fuel screen vehicle switcher
  'qrcode.viewfinder': 'qr-code-scanner',            // Scan overlay center icon
  'wrench.fill': 'build',                            // Mechanic finder map pins
  'star.fill': 'star',                               // Mechanic rating chip
  'phone.fill': 'call',                              // Mechanic call button
  'arrow.triangle.turn.up.right.diamond.fill': 'directions', // Directions button
  'gauge': 'speed',                                  // Scan tile: RPM
  'thermometer': 'thermostat',                       // Scan tile: coolant
  'exclamationmark.triangle.fill': 'warning',        // Scan faults: URGENT chip
  'gearshape.2.fill': 'engineering',                 // Scan faults: fault row icon
} as IconMapping;

/**
 * An icon component that uses native SF Symbols on iOS, and Material Icons on Android and web.
 * This ensures a consistent look across platforms, and optimal resource usage.
 * Icon `name`s are based on SF Symbols and require manual mapping to Material Icons.
 */
export function IconSymbol({
  name,
  size = 24,
  color,
  style,
}: {
  name: IconSymbolName;
  size?: number;
  color: string | OpaqueColorValue;
  style?: StyleProp<TextStyle>;
  weight?: SymbolWeight;
}) {
  return <MaterialIcons color={color} size={size} name={MAPPING[name]} style={style} />;
}
