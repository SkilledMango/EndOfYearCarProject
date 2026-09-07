// גיבוי: אייקוני Material באנדרואיד ובווב

import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { SymbolWeight, SymbolViewProps } from 'expo-symbols';
import { ComponentProps } from 'react';
import { OpaqueColorValue, type StyleProp, type TextStyle } from 'react-native';

type IconMapping = Record<SymbolViewProps['name'], ComponentProps<typeof MaterialIcons>['name']>;
type IconSymbolName = keyof typeof MAPPING;

/**
 * מיפוי בין שמות האייקונים של iOS לשמות המקבילים ב-Material.
 * כל אייקון חדש שמשתמשים בו צריך להתווסף כאן.
 */
const MAPPING = {
  'house.fill': 'home',
  'clock.fill': 'history',
  'fuelpump.fill': 'local-gas-station',
  'paperplane.fill': 'send',
  'chevron.left.forwardslash.chevron.right': 'code',
  'chevron.right': 'chevron-right',
  'location.fill': 'place',        // היה חסר, ולכן האייקון של טאב הניווט נשבר באנדרואיד
  'person.fill': 'person',         // טאב הפרופיל
  'plus': 'add',                   // כפתור ההוספה במסך הדלק
  'arrow.down': 'arrow-downward',  // מגמת דלק משתפרת
  'arrow.up': 'arrow-upward',      // מגמת דלק מתדרדרת
  'car.fill': 'directions-car',    // מחליף הרכבים במסך הדלק
  'qrcode.viewfinder': 'qr-code-scanner',            // האייקון במרכז מסך הסריקה
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
