import { fromCore } from 'core';
import { fromExtra } from 'core/extra';
import { fromShared } from '~/lib.ts';
import { own } from 'mapped';
import { join } from '@std/path';

export const all = [fromCore, fromExtra, fromShared, own, join];
