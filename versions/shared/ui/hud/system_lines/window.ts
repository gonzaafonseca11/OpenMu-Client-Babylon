import { defineWindow } from '@/controllers/interface/windows';
import { SystemLines } from '.';

export default defineWindow({ id: 'system_lines', slot: 'hud', order: 45, component: SystemLines });
