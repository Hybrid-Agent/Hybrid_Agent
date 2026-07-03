import "./global.css";
import { SafeAreaProvider } from 'react-native-safe-area-context';
import Navigation from './navigation';

import { ThemeProvider } from './lib/theme';

export default function App() {
  return (
    <ThemeProvider>
      <SafeAreaProvider>
        <Navigation />
      </SafeAreaProvider>
    </ThemeProvider>
  );
}
