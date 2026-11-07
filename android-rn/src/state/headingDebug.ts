// Diagnóstico temporal de la fusión de rumbo (se muestra solo tras mantener pulsado «Precisión brújula»).
import { createStore } from 'zustand/vanilla';
import type { FusionOutput } from '../core/headingFusion';

export const headingDebug = createStore<{ last: FusionOutput['debug'] | undefined }>(() => ({ last: undefined }));
