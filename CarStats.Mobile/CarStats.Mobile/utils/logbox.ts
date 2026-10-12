import { LogBox } from 'react-native';

// מסתיר את אזהרת Expo Go על פוש מרוחק (לא תקלה באפליקציה)
LogBox.ignoreLogs([
  'expo-notifications: Android Push notifications (remote notifications)',
]);
