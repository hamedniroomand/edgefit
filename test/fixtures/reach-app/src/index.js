import * as whole from 'whole-lib';

import { tail } from 'dir-tools';
import { upper } from 'str-utils';

export default {
  fetch() {
    // `upper` is all of str-utils this uses; its `watchDir` is never reached.
    // `tail` is used, so the file watching behind it is reported.
    // whole-lib is imported as a namespace and only `a` is read from it, so `b` is not reached.
    return new Response(upper(tail('log')) + whole.a());
  },
};
