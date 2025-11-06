// constants/jobItemOptions.js

export const JOB_ITEM_OPTION_TEMPLATES = {
  SingleSheet: {
    sides: 'Single Side', // or Both Side
    color_scheme: 'Black and White', // or Multi-color
    cover_pages: 0,
    inside_pages: 0,
    cover_paper_gsm: '',
    inside_paper_gsm: '',
    binding_types: [
      // Possible: Cutting, Trimming, Lamination, Creasing, Folding, Centre Pin, etc.
    ],
  },

  MultipleSheet: {
    sides: 'Single Side',
    color_scheme: 'Black and White',
    cover_pages: 0,
    inside_pages: 0,
    cover_paper_gsm: '',
    inside_paper_gsm: '',
    binding_types: [],
  },

  WideFormat: {
    type_of_print: '', // e.g. Wide-Format, Digital Machine, Flex Machine, HMT
    binding_types: [],
    size: '',
  },

  Other: {
    binding_types: [],
    size: '',
  },
};
