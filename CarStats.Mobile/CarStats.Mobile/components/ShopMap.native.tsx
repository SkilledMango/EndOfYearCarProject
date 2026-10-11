/**
 * המפה האמיתית של מוצא המוסכים, לאנדרואיד ול-iOS.
 * הסיכות עגולות ומתחלפות בין מלאות למתוארות, והמוסך המורשה של היצרן
 * מקבל סיכה ירוקה עם כוכב. המפה ממסגרת את עצמה סביב הסיכות והמשתמש.
 */

import React, { useEffect, useRef, useState } from 'react';
import { StyleSheet } from 'react-native';
import MapView, { Marker } from 'react-native-maps';
import type { ShopMapProps } from './ShopMap.types';

// הסיכות הן תמונות מוכנות ולא רכיבים. באנדרואיד עם הארכיטקטורה החדשה,
// react-native-maps מצלם סיכה שבנויה מרכיבים מתוך תיבה קטנה מהתוכן שלה,
// והסיכה יוצאת חתוכה (באג פתוח בספרייה, react-native-maps#5877). תמונה
// מוצגת כמו שהיא, בלי צילום, ולכן לא נחתכת — וגם לא צורכת זיכרון על כל
// ציור מחדש. הצבעים הם של ערכת הנושא; התמונות נוצרו ב-@1x/@2x/@3x.
const PIN_SHOP     = require('@/assets/images/pin-shop.png');
const PIN_SHOP_ALT = require('@/assets/images/pin-shop-alt.png');
const PIN_BRAND    = require('@/assets/images/pin-brand.png');

// תל אביב, אזור ברירת מחדל סביר עד שהסיכות ידועות
const DEFAULT_REGION = {
  latitude: 32.08,
  longitude: 34.78,
  latitudeDelta: 0.25,
  longitudeDelta: 0.25,
};

// איתור: המפה עם סיכות המוסכים
export default function ShopMap({ shops, userPos }: ShopMapProps) {
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
          image={shop.highlighted ? PIN_BRAND : i % 2 === 1 ? PIN_SHOP_ALT : PIN_SHOP}
          // המוסך המורשה מעל שאר הסיכות כשהן חופפות
          zIndex={shop.highlighted ? 1 : 0}
        />
      ))}
    </MapView>
  );
}

const styles = StyleSheet.create({
  map: { flex: 1 },
});
