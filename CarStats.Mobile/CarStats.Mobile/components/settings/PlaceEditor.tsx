/**
 * עורך מקום שמור אחד — הבית או העבודה — במסך ההגדרות.
 *
 * הקלדת כתובת (עם השלמה אוטומטית) או לקיחת המיקום הנוכחי, ותווית שמראה
 * מה נשמר. אותו רכיב משמש לשני המקומות, כדי שלא יהיו שני עותקים של אותה
 * לוגיקה במסך. השמירה עצמה — העדפות וגדר גיאוגרפית — נשארת אצל המסך.
 */

import React, { useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { Button, TextInput } from 'react-native-paper';
import * as Location from 'expo-location';
import { geocodeAddress } from '@/services/api';
import { captureCurrentLocation } from '@/services/notifications';
import { usePlaceSuggestions } from '@/hooks/usePlaceSuggestions';
import { createThemedStyles } from '@/context/ThemeContext';

export interface PlaceEditorProps {
  title: string;
  subtitle: string;
  /** "Home" / "Work" — לתווית השדה ולתווית מה שנשמר */
  name: string;
  placeholder: string;
  icon: string;
  /** מה שנשמר כרגע, לתצוגה. null = עוד לא נשמר כלום */
  savedLabel: string | null;
  disabled?: boolean;
  onSave: (lat: number, lng: number, label: string) => Promise<void>;
  onRemove: () => Promise<void>;
}

export default function PlaceEditor({
  title, subtitle, name, placeholder, icon, savedLabel, disabled, onSave, onRemove,
}: PlaceEditorProps) {
  const s = useStyles();
  const [address, setAddress] = useState('');
  const [busy, setBusy] = useState(false);
  const { suggestions, visible, search, clear } = usePlaceSuggestions();
  const off = busy || !!disabled;

  const onChange = (text: string) => {
    setAddress(text);
    search(text);
  };

  const pickSuggestion = (description: string) => {
    setAddress(description);
    clear();
  };

  // הקלדת כתובת לא דורשת GPS כלל, וזה חשוב במכשיר שלא מצליח לאכן —
  // וגם מאפשרת להגדיר מקום שלא נמצאים בו כרגע.
  const saveFromAddress = async () => {
    const query = address.trim();
    if (!query) { Alert.alert('Enter an address', `Type your ${name.toLowerCase()} address first.`); return; }

    setBusy(true);
    try {
      const found = await geocodeAddress(query);
      if (!found) {
        Alert.alert('Address not found', 'Try adding the city, e.g. "Agmon 13, Hadera".');
        return;
      }
      await onSave(found.latitude, found.longitude, found.formattedAddress);
      setAddress('');
      clear();
    } catch (err: any) {
      console.warn('[settings] geocode failed', err);
      const status = err?.response?.status;
      Alert.alert(
        'Could not save location',
        status === 404
          ? 'The server does not have address lookup yet. It needs to be published.'
          : status === 503
            ? 'Address lookup is not configured on the server.'
            : 'Check your connection and try again.',
      );
    } finally {
      setBusy(false);
    }
  };

  const saveFromGps = async () => {
    setBusy(true);
    try {
      const { lat, lng } = await captureCurrentLocation();

      // המרת הקואורדינטות לכתובת קריאה. נעשה במכשיר ולא דרך השרת, כי
      // הספרייה כבר יודעת לעשות זאת וזה חוסך פנייה שלמה בשביל תווית.
      let label = `${lat.toFixed(4)}, ${lng.toFixed(4)}`;
      try {
        const [place] = await Location.reverseGeocodeAsync({ latitude: lat, longitude: lng });
        if (place) {
          const parts = [
            [place.street, place.streetNumber].filter(Boolean).join(' '),
            place.city ?? place.subregion,
          ].filter(Boolean);
          if (parts.length) label = parts.join(', ');
        }
      } catch { /* אין המרה הפוכה זמינה — הקואורדינטות יספיקו */ }

      await onSave(lat, lng, label);
    } catch (err: any) {
      Alert.alert('Could not get your location', err?.message ?? 'Type your address instead.');
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    setBusy(true);
    try {
      await onRemove();
    } finally {
      setBusy(false);
    }
  };

  return (
    <View>
      <Text style={s.rowTitle}>{title}</Text>
      <Text style={s.rowSub}>{subtitle}</Text>

      <View>
        <TextInput
          mode="outlined"
          dense
          label={`${name} address`}
          placeholder={placeholder}
          value={address}
          onChangeText={onChange}
          disabled={off}
          style={s.input}
          left={<TextInput.Icon icon={icon} />}
          onSubmitEditing={saveFromAddress}
          returnKeyType="done"
          autoCorrect={false}
        />

        {visible && suggestions.length > 0 && (
          <View style={s.dropdown}>
            {suggestions.map((sug, i) => (
              <Pressable
                key={sug.placeId}
                style={[s.dropdownItem, i < suggestions.length - 1 && s.dropdownDivider]}
                onPress={() => pickSuggestion(sug.description)}
              >
                <Text style={s.dropdownText} numberOfLines={1}>{sug.description}</Text>
              </Pressable>
            ))}
          </View>
        )}
      </View>

      <Button
        mode="contained"
        icon="content-save"
        onPress={saveFromAddress}
        disabled={off || !address.trim()}
        style={s.btn}
        contentStyle={s.btnContent}
      >
        Save this address
      </Button>

      <Button
        mode="outlined"
        icon="crosshairs-gps"
        onPress={saveFromGps}
        disabled={off}
        style={s.btn}
        contentStyle={s.btnContent}
      >
        Use my current location
      </Button>

      {savedLabel != null && (
        <View style={s.savedRow}>
          <Text style={s.savedBadge} numberOfLines={2}>{name}: {savedLabel}</Text>
          <Button mode="text" compact onPress={remove} disabled={off}>
            Remove
          </Button>
        </View>
      )}
    </View>
  );
}

const useStyles = createThemedStyles((c) => StyleSheet.create({
  rowTitle: { fontSize: 15, fontWeight: '700', color: c.Dashboard.textPrimary },
  rowSub:   { fontSize: 13, color: c.Dashboard.textSecondary, marginTop: 2, lineHeight: 18 },

  input: { marginTop: 12 },
  // רשימת ההצעות מרחפת מעל התוכן ולא דוחפת אותו, כדי שהכרטיס לא יקפוץ
  // בכל פעם שההצעות מופיעות.
  dropdown: {
    position: 'absolute',
    top: '100%',
    left: 0,
    right: 0,
    zIndex: 20,
    backgroundColor: c.Dashboard.card,
    borderWidth: 1,
    borderColor: c.Dashboard.cardBorder,
    borderRadius: 10,
    overflow: 'hidden',
  },
  dropdownItem:    { paddingHorizontal: 14, paddingVertical: 12 },
  dropdownDivider: { borderBottomWidth: 1, borderBottomColor: c.Dashboard.cardBorder },
  dropdownText:    { fontSize: 14, color: c.Dashboard.textPrimary },

  btn:        { marginTop: 10 },
  btnContent: { paddingVertical: 4 },

  savedRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', marginTop: 8, gap: 4 },
  savedBadge: {
    flexShrink: 1,
    fontSize: 11,
    fontWeight: '800',
    color: c.Severity.green,
    letterSpacing: 1,
    textAlign: 'center',
  },
}));
