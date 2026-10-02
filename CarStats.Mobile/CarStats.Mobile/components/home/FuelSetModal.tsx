/**
 * הזנה ידנית של מפלס הדלק (או הסוללה) וגודל המיכל, שהופכת לנקודת ההתחלה
 * שממנה ההערכה יורדת. נגיש רק ברכבים שלא מדווחים מפלס בעצמם.
 *
 * גודל המיכל מגיע ממולא מראש — מה-AI או ממה שהנהג הקליד בפעם הקודמת.
 */

import React, { useEffect, useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { createThemedStyles, useTheme } from '@/context/ThemeContext';
import { capacityLabel, energyUnit } from '@/utils/powertrain';

const QUICK_FILL = [
  { label: '¼',    pct: 25 },
  { label: '½',    pct: 50 },
  { label: '¾',    pct: 75 },
  { label: 'FULL', pct: 100 },
];

export default function FuelSetModal({
  visible,
  currentEstimate,
  isElectric = false,
  tankSize,
  onSave,
  onCancel,
}: {
  visible: boolean;
  currentEstimate: number | null;
  isElectric?: boolean;
  /** הגודל הידוע של המיכל/הסוללה, אם יש — ממלא את השדה מראש. */
  tankSize?: number | null;
  /** tankL: ליטרים, או קוט"ש ברכב חשמלי. */
  onSave: (pct: number, tankL: number) => void;
  onCancel: () => void;
}) {
  const { colors: c } = useTheme();
  const modalStyles = useModalStyles();
  // ערך ברירת מחדל רק כשאין שום דבר ידוע על הרכב
  const fallbackSize = isElectric ? 60 : 55;
  const [pctText,  setPctText]  = useState(String(currentEstimate ?? 100));
  const [tankText, setTankText] = useState(String(tankSize || fallbackSize));

  useEffect(() => {
    if (!visible) return;
    setPctText(String(currentEstimate ?? 100));
    setTankText(String(tankSize || fallbackSize));
  }, [visible, currentEstimate, tankSize, fallbackSize]);

  const handleSave = () => {
    const pct   = Math.min(100, Math.max(0, Number(pctText)  || 0));
    const tankL = Math.max(10,              Number(tankText) || fallbackSize);
    onSave(pct, tankL);
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel}>
      <View style={modalStyles.overlay}>
        <View style={modalStyles.sheet}>
          <Text style={modalStyles.title}>{isElectric ? 'SET BATTERY LEVEL' : 'SET FUEL LEVEL'}</Text>
          <Text style={modalStyles.sub}>
            {isElectric
              ? 'Your OBD adapter can’t read the battery level directly.'
              : 'Your OBD adapter can’t read the fuel sensor directly.'}{'\n'}
            Set your current level and the app will track usage automatically.
          </Text>

          {/* ── כפתורי מילוי מהיר ── */}
          <View style={modalStyles.quickRow}>
            {QUICK_FILL.map(q => (
              <Pressable
                key={q.pct}
                style={[
                  modalStyles.quickBtn,
                  pctText === String(q.pct) && modalStyles.quickBtnActive,
                ]}
                onPress={() => setPctText(String(q.pct))}
              >
                <Text style={[
                  modalStyles.quickLabel,
                  pctText === String(q.pct) && modalStyles.quickLabelActive,
                ]}>
                  {q.label}
                </Text>
              </Pressable>
            ))}
          </View>

          {/* ── הזנת אחוז ידנית ── */}
          <View style={modalStyles.inputRow}>
            <Text style={modalStyles.inputLabel}>Custom %</Text>
            <TextInput
              style={modalStyles.input}
              value={pctText}
              onChangeText={setPctText}
              keyboardType="numeric"
              maxLength={3}
              placeholderTextColor={c.Dashboard.textSecondary}
              placeholder="0–100"
            />
          </View>

          {/* ── גודל המיכל או הסוללה ── */}
          <View style={modalStyles.inputRow}>
            <Text style={modalStyles.inputLabel}>
              {capacityLabel(isElectric)} ({energyUnit(isElectric)})
            </Text>
            <TextInput
              style={modalStyles.input}
              value={tankText}
              onChangeText={setTankText}
              keyboardType="numeric"
              maxLength={4}
              placeholderTextColor={c.Dashboard.textSecondary}
              placeholder={`e.g. ${fallbackSize}`}
            />
          </View>
          <Text style={modalStyles.hint}>
            {tankSize
              ? 'Filled in for your car — edit if it’s wrong.'
              : isElectric
                ? 'Most EVs 50–100 kWh'
                : 'Kia Sportage ≈ 55 L  ·  Most sedans 50–65 L'}
          </Text>

          {/* ── כפתורים ── */}
          <View style={modalStyles.btnRow}>
            <Pressable style={modalStyles.cancelBtn} onPress={onCancel}>
              <Text style={modalStyles.cancelText}>CANCEL</Text>
            </Pressable>
            <Pressable style={modalStyles.saveBtn} onPress={handleSave}>
              <Text style={modalStyles.saveText}>SAVE</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const useModalStyles = createThemedStyles((c) => StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: '#000000BB',
    justifyContent: 'center',
    padding: 24,
  },
  sheet: {
    backgroundColor: c.Dashboard.card,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: c.Dashboard.cardBorder,
    padding: 24,
    gap: 16,
  },
  title: {
    fontSize: 13,
    fontWeight: '800',
    color: c.Dashboard.textPrimary,
    letterSpacing: 1.5,
  },
  sub: {
    fontSize: 13,
    color: c.Dashboard.textSecondary,
    lineHeight: 19,
  },
  quickRow: {
    flexDirection: 'row',
    gap: 8,
  },
  quickBtn: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: c.Dashboard.cardBorder,
    alignItems: 'center',
    backgroundColor: c.Dashboard.bg,
  },
  quickBtnActive: {
    borderColor: c.Dashboard.accent,
    backgroundColor: c.Dashboard.accent + '22',
  },
  quickLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: c.Dashboard.textSecondary,
  },
  quickLabelActive: {
    color: c.Dashboard.accent,
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  inputLabel: {
    flex: 1,
    fontSize: 13,
    color: c.Dashboard.textSecondary,
  },
  input: {
    width: 80,
    backgroundColor: c.Dashboard.bg,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: c.Dashboard.cardBorder,
    padding: 10,
    fontSize: 16,
    fontWeight: '600',
    color: c.Dashboard.textPrimary,
    textAlign: 'center',
  },
  hint: {
    fontSize: 11,
    color: c.Dashboard.textSecondary,
    marginTop: -8,
  },
  btnRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 4,
  },
  cancelBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: c.Dashboard.cardBorder,
    alignItems: 'center',
  },
  cancelText: {
    fontSize: 13,
    fontWeight: '700',
    color: c.Dashboard.textSecondary,
    letterSpacing: 1,
  },
  saveBtn: {
    flex: 2,
    paddingVertical: 12,
    borderRadius: 8,
    backgroundColor: c.Dashboard.accent,
    alignItems: 'center',
  },
  saveText: {
    fontSize: 13,
    fontWeight: '700',
    color: c.Dashboard.onAccent,
    letterSpacing: 1,
  },
}));
