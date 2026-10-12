import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { SymbolWeight, SymbolViewProps } from 'expo-symbols';
import { ComponentProps } from 'react';
import { OpaqueColorValue, type StyleProp, type TextStyle } from 'react-native';

type IconMapping = Record<SymbolViewProps['name'], ComponentProps<typeof MaterialIcons>['name']>;
type IconSymbolName = keyof typeof MAPPING;

// מיפוי שמות אייקונים מ-iOS ל-Material; אייקון חדש מוסיפים כאן
const MAPPING = {
  'house.fill': 'home',
  'clock.fill': 'history',
  'fuelpump.fill': 'local-gas-station',
  'bolt.fill': 'bolt',
  'paperplane.fill': 'send',
  'chevron.left.forwardslash.chevron.right': 'code',
  'chevron.right': 'chevron-right',
  'location.fill': 'place',
  'person.fill': 'person',
  'plus': 'add',
  'arrow.down': 'arrow-downward',
  'arrow.up': 'arrow-upward',
  'car.fill': 'directions-car',
  'qrcode.viewfinder': 'qr-code-scanner',
  'wrench.fill': 'build',
  'star.fill': 'star',
  'phone.fill': 'call',
  'arrow.triangle.turn.up.right.diamond.fill': 'directions',
  'gauge': 'speed',
  'thermometer': 'thermostat',
  'exclamationmark.triangle.fill': 'warning',
  'gearshape.2.fill': 'engineering',
} as IconMapping;

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
