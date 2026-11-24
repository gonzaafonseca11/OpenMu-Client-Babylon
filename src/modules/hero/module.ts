import { defineModule } from '../module';
import { installNet } from './net';
import { onHeroPacket } from './widePoints';

export default defineModule({
  id: 'hero',
  core: true,
  install(api) {
    installNet();
    api?.onPacket(onHeroPacket);
  },
});
