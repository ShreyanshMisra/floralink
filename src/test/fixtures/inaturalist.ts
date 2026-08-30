export const emeraldAshBorerTaxon = {
  id: 70057,
  name: "Agrilus planipennis",
  preferred_common_name: "Emerald Ash Borer",
  rank: "species",
  matched_term: "emerald ash borer",
  default_photo: {
    medium_url: "https://inaturalist-open-data.s3.amazonaws.com/photos/1/medium.jpg",
  },
};

export const spottedLanternflyTaxon = {
  id: 324726,
  name: "Lycorma delicatula",
  preferred_common_name: "Spotted Lanternfly",
  rank: "species",
  matched_term: "spotted lanternfly",
  default_photo: null,
};

export const ambiguousAshTaxa = [
  emeraldAshBorerTaxon,
  {
    id: 54939,
    name: "Fraxinus americana",
    preferred_common_name: "White Ash",
    rank: "species",
    matched_term: "ash",
    default_photo: null,
  },
];
