/**
 * The confidentiality agreement a viewer accepts before an offering's detail
 * is shown to them.
 *
 * Kept as data in one place, versioned, and never edited in place. Changing
 * the words means adding a version: the acceptance records store the version
 * string they were signed against, and a record that points at text which has
 * since changed cannot answer the only question it exists to answer.
 *
 * This is deliberately a short, plain mutual NDA rather than a long one. A
 * person who does not read it has not agreed to anything in a meaningful
 * sense, and length is the most reliable way to stop people reading.
 *
 * It is not legal advice and has not been reviewed by counsel. A deployment
 * putting real offerings in front of real investors should have its own
 * lawyers replace `CURRENT_NDA` before it does so.
 */

export interface NdaText {
  version: string
  title: string
  /** Shown above the clauses; sets out what the reader is agreeing to and why. */
  preamble: string
  clauses: { heading: string; body: string }[]
  /** Shown immediately above the signature field. */
  attestation: string
}

export const CURRENT_NDA: NdaText = {
  version: 'mutual-nda-v1',
  title: 'Confidentiality agreement',
  preamble:
    'The operator of this facility is willing to show you its financial statements, census, payer mix, valuation and transaction terms so that you can decide whether to invest. That information is not public and its disclosure could harm the operator, its residents’ privacy interests, and its negotiating position. Before it is shown to you, you are asked to agree to the following.',
  clauses: [
    {
      heading: 'What is confidential',
      body: 'Everything on this offering that is not already public: financial statements and projections, census and occupancy, payer mix, appraisals, purchase and loan terms, the identity of the facility where the operator has chosen not to publish it, the terms of the raise, and any document released to you in the data room. Information you can show was already public, already known to you without obligation, or independently developed by you without reference to what you see here, is not confidential.',
    },
    {
      heading: 'What you may do with it',
      body: 'Use it to evaluate whether to invest in this offering, and for nothing else. You may share it with your own advisers — counsel, accountants, and people at your firm who need it for the same evaluation — provided you tell them it is confidential and you remain responsible for their handling of it.',
    },
    {
      heading: 'What you may not do with it',
      body: 'You may not publish it, pass it to anyone else, use it to compete with the operator or to approach the seller, tenant, lender or staff directly, or trade on it. You may not use it to solicit the operator’s employees.',
    },
    {
      heading: 'No representation, no offer',
      body: 'The operator gives no warranty that any figure shown is accurate or complete, and nothing shown to you is an offer to sell a security. Forward-looking figures are projections from stated assumptions, not forecasts and not promises. You will do your own diligence and reach your own conclusions.',
    },
    {
      heading: 'Required disclosure',
      body: 'If a court or regulator compels you to disclose something covered by this agreement, you may disclose it — but you will tell the operator first, so far as you are lawfully able to, and disclose only what you are required to.',
    },
    {
      heading: 'How long it lasts',
      body: 'Two years from the day you accept, whether or not you invest. If you do invest, the terms of the investment documents govern from that point and this agreement continues alongside them.',
    },
    {
      heading: 'Who it binds',
      body: 'You and the organisation you are signing on behalf of, and the operator of this facility. CareCapital Exchange is not a party to it; it records your acceptance and shows the operator that it was given.',
    },
  ],
  attestation:
    'I have read this agreement, I am authorised to accept it on behalf of my organisation, and I agree to be bound by it.',
}
