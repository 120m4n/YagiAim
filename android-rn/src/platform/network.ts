import NetInfo from '@react-native-community/netinfo';
import type { NetworkSource } from '../state/networkStore';

/** PM-13: `isConnected`, no `isInternetReachable` (iOS tampoco verifica Internet). */
export const netInfoSource: NetworkSource = (onChange) => NetInfo.addEventListener((s) => onChange(s.isConnected));
