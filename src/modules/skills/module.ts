import { defineModule } from '../module';
import { installNet } from './net';
import { installMasterLevel } from './masterLevel';
import { installMasterTree } from './masterTree';
import { onSkillsPacket } from './resetWaiver';

export default defineModule({
  id: 'skills',
  core: true,
  install(api) {
    installMasterLevel();
    installMasterTree();
    installNet();
    api?.onPacket(onSkillsPacket);
  },
});
