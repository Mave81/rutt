/**
 * @format
 */
// Polyfills för Opter-klienten (SignalR + binärprotokoll) i React Native
import 'react-native-url-polyfill/auto';
import {Buffer} from 'buffer';
global.Buffer = global.Buffer || Buffer;

import {AppRegistry} from 'react-native';
import App from './App';
import {name as appName} from './app.json';

AppRegistry.registerComponent(appName, () => App);
// Håller JS-timers igång i bakgrunden (Opter-anslutningen, GPS, nya uppdrag). Tar aldrig slut – stoppas från appen.
AppRegistry.registerHeadlessTask('RuttAlive', () => () => new Promise(() => {}));
