// Case studies a pitch can cite. Only numbers Chase has confirmed go here:
// the team picks from this list, they never type their own proof figures.

export interface ProofItem {
  key: string;
  client: string;
  site: string;
  headline: string; // the number, big on the card
  detail: string;
}

export const PROOF: ProofItem[] = [
  {
    key: "bronco",
    client: "Bronco Plumbing DFW",
    site: "broncoplumbingdfw.com",
    headline: "$50k+ in 5 months",
    detail: "Website and local search. 5.0 stars from 52 Google reviews, average Google position 5.2.",
  },
  {
    key: "exotic-ripz",
    client: "Exotic Ripz",
    site: "Shopify store",
    headline: "$191,042 in sales",
    detail: "1,790 orders between April and October 2025 on the store we built.",
  },
  {
    key: "kofi",
    client: "Coach Kofi",
    site: "coachkofi.de",
    headline: "+200% consultations",
    detail: "Coaching website built by Blok Blok.",
  },
  {
    key: "luki",
    client: "Coach Luki",
    site: "coachluki.com",
    headline: "Coaching website",
    detail: "Website for coach Luki, with a client testimonial video.",
  },
];

export const PROOF_KEYS = PROOF.map((p) => p.key);

export const STUDIO = {
  name: "Blok Blok Studio",
  site: "blokblokstudio.com",
  booking: "https://calendar.app.google/Vk72posRYTuj6KHs8",
  about: "A team of 4 across Berlin, Los Angeles and Virginia, building websites since 2024.",
};
