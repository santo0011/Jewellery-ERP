// server-roundoff: English → [বাংলা, हिन्दी]. Round-off on the billing screen and in Tax settings, and what the
// server says about it. A server-* file: its {{placeholders}} are matched against whole messages.
export default {
  "Before round off": ["রাউন্ড অফের আগে", "राउंड ऑफ़ से पहले"],
  "Adjustment": ["সমন্বয়", "समायोजन"],
  "Adjustment {{amount}}": ["সমন্বয় {{amount}}", "समायोजन {{amount}}"],
  "Auto": ["অটো", "ऑटो"],
  "Nearest": ["নিকটতম", "निकटतम"],
  "Down": ["কমিয়ে", "घटाकर"],
  "Up": ["বাড়িয়ে", "बढ़ाकर"],
  "Round to": ["রাউন্ড হবে", "राउंड होगा"],
  "Change the limit in Business settings": ["Business settings-এ সীমা বদলান", "Business settings में सीमा बदलें"],
  "Up to {{limit}}": ["সর্বোচ্চ {{limit}}", "अधिकतम {{limit}}"],
  "Final amount": ["চূড়ান্ত টাকা", "अंतिम राशि"],
  "What the customer pays for this bill": ["এই বিলে কাস্টমার যত টাকা দেবেন", "इस बिल के लिए ग्राहक जितना देगा"],
  "More than the round-off limit — give a discount instead": ["রাউন্ড অফের সীমার বেশি — বরং ছাড় দিন", "राउंड ऑफ़ सीमा से ज़्यादा — इसके बजाय छूट दें"],
  "Needs permission to give discounts": ["ছাড় দেওয়ার অনুমতি লাগবে", "छूट देने की अनुमति चाहिए"],
  "Use Auto": ["অটো ব্যবহার করুন", "ऑटो इस्तेमाल करें"],
  "Largest round-off on a bill": ["একটি বিলে সর্বোচ্চ রাউন্ড অফ", "एक बिल पर अधिकतम राउंड ऑफ़"],
  "When billing rounds a bill its own way (up, down, by hand). More than this is a discount.": ["বিল করার সময় নিজের মতো রাউন্ড করলে (বাড়িয়ে, কমিয়ে, হাতে)। এর বেশি হলে তা ছাড় হিসেবে দিন।", "बिलिंग के समय अपने तरीके से राउंड करने पर (बढ़ाकर, घटाकर, मैनुअल)। इससे ज़्यादा छूट माना जाएगा।"],

  // Compliance limits (Business settings → Jewellery) and the billing warning that uses them.
  "Bills above {{amount}} need the customer's PAN — add PAN to {{name}}.": ["{{amount}}-এর বেশি বিলে কাস্টমারের PAN লাগে — {{name}}-এর PAN যোগ করুন।", "{{amount}} से ज़्यादा के बिल पर ग्राहक का PAN चाहिए — {{name}} का PAN जोड़ें।"],
  "Bills above {{amount}} need a customer with PAN — select the customer.": ["{{amount}}-এর বেশি বিলে PAN সহ কাস্টমার লাগে — কাস্টমার বাছুন।", "{{amount}} से ज़्यादा के बिल पर PAN वाला ग्राहक चाहिए — ग्राहक चुनें।"],
  "Bills above {{amount}} need the customer’s PAN. (Income-tax rules require it above ₹2,00,000.)": ["{{amount}}-এর বেশি বিলে কাস্টমারের PAN লাগবে। (আয়কর আইনে ₹2,00,000-এর বেশিতে PAN বাধ্যতামূলক।)", "{{amount}} से ज़्यादा के बिल पर ग्राहक का PAN लगेगा। (आयकर नियमों में ₹2,00,000 से ऊपर PAN ज़रूरी है।)"],
  "Cash on one bill is limited to {{amount}}. (Section 269ST prohibits ₹2,00,000 or more in cash.)": ["একটি বিলে নগদ সর্বোচ্চ {{amount}}। (ধারা 269ST অনুযায়ী ₹2,00,000 বা তার বেশি নগদ নেওয়া নিষেধ।)", "एक बिल पर नकद अधिकतम {{amount}}। (धारा 269ST के अनुसार ₹2,00,000 या उससे ज़्यादा नकद लेना मना है।)"],

  // From the server.
  "Rounding the bill down needs permission to give discounts": ["বিল কমিয়ে রাউন্ড করতে ছাড় দেওয়ার অনুমতি লাগে", "बिल घटाकर राउंड करने के लिए छूट देने की अनुमति चाहिए"],
  "The bill total must be more than zero": ["বিলের মোট টাকা শূন্যের বেশি হতে হবে", "बिल का कुल शून्य से ज़्यादा होना चाहिए"],
  "Round-off of {{amount}} is more than the {{limit}} allowed. Give a discount on the items instead.": ["{{amount}} রাউন্ড অফ অনুমোদিত {{limit}}-এর বেশি। বরং আইটেমে ছাড় দিন।", "{{amount}} का राउंड ऑफ़ अनुमत {{limit}} से ज़्यादा है। इसके बजाय आइटम पर छूट दें।"],
  "Round to ₹1, ₹10, ₹50 or ₹100": ["₹1, ₹10, ₹50 বা ₹100-এ রাউন্ড করুন", "₹1, ₹10, ₹50 या ₹100 तक राउंड करें"],
  "No {{metal}} {{purity}} rate entered": ["{{metal}} {{purity}}-এর দর দেওয়া হয়নি — আজকের দর দিন", "{{metal}} {{purity}} का भाव नहीं डाला गया — आज का भाव डालें"],
};
