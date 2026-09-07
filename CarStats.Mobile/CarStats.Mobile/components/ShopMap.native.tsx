/**
 * המפה האמיתית של מוצא המוסכים, לאנדרואיד ול-iOS.
 * הסיכות עגולות ומתחלפות בין מלאות למתוארות, והמפה ממסגרת את עצמה
 * סביב הסיכות והמשתמש.
 */

import React, { useEffect, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import MapView, { Marker } from 'react-native-maps';
import { createThemedStyles, useTheme } from '@/context/ThemeContext';
import { IconSymbol } from '@/components/ui/icon-symbol';
import type { ShopMapProps } from './ShopMap.types';

// תל אביב, אזור ברירת מחדל סביר עד שהסיכות ידועות
const DEFAULT_REGION = {
  latitude: 32.08,
  longitude: 34.78,
  latitudeDelta: 0.25,
  longitudeDelta: 0.25,
};

export default function ShopMap({ shops, userPos }: ShopMapProps) {
  const { colors: c } = useTheme();
  const styles = useStyles();
  const mapRef = useRef<MapView>(null);
  // באנדרואיד המסגור לא עובד עד שהמפה סיימה להיפרס, והוא נכשל בשקט:
  // המפה נשארה על תל אביב בזמן שהרשימה מתחתיה הציגה מוסכים בחדרה.
  // ההמתנה לאירוע המוכנות היא מה שגורם למסגור להיתפס.
  const [mapReady, setMapReady] = useState(false);

  useEffect(() => {
    if (!mapReady || shops.length === 0) return;
    const coords = shops.map(s => ({ latitude: s.latitude, longitude: s.longitude }));
    if (userPos) coords.push({ latitude: userPos.lat, longitude: userPos.lng });
    mapRef.current?.fitToCoordinates(coords, {
      edgePadding: { top: 60, bottom: 60, left: 60, right: 60 },
      animated: false,
    });
  }, [mapReady, shops, userPos]);

  return (
    <MapView
      ref={mapRef}
      style={styles.map}
      initialRegion={DEFAULT_REGION}
      onMapReady={() => setMapReady(true)}
      showsUserLocation
      showsMyLocationButton={false}
      toolbarEnabled={false}
    >
      {shops.map((shop, i) => (
        <Marker
          key={shop.id}
          coordinate={{ latitude: shop.latitude, longitude: shop.longitude }}
          title={shop.name}
          description={shop.specialty}
          anchor={{ x: 0.5, y: 0.5 }}
        >
          {/* העיצוב מחליף בין סיכות מלאות למתוארות */}
          <View style={[styles.pin, i % 2 === 1 && styles.pinOutlined]}>
            <IconSymbol
              name="wrench.fill"
              size={18}
              color={i % 2 === 1 ? c.Dashboard.accentDeep : c.Dashboard.onAccent}
            />
          </View>
        </Marker>
      ))}
    </MapView>
  );
}

const useStyles = createThemedStyles((c) => StyleSheet.create({
  map: { flex: 1 },

  // עיגולים בקוטר 40, בגרסה מלאה ובגרסה מתוארת
  pin: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: c.Dashboard.accentDeep,
    alignItems: 'center', justifyContent: 'center',
    shadowColor: '#000', shadowOpacity: 0.15, shadowRadius: 20, shadowOffset: { width: 0, height: 8 },
    elevation: 5,
  },
  pinOutlined: {
    backgroundColor: c.Dashboard.card,
    borderWidth: 2, borderColor: c.Dashboard.accentDeep,
  },
}));
