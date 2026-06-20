# generated

The SDK's instruction builders in `../instructions.ts` are **self-contained** and
do not require a runtime IDL — they compute Anchor discriminators directly, so
the SDK works the moment the program is deployed.

After `anchor build`, the canonical artifacts appear at:
- `programs/solrival-escrow/target/idl/solrival_escrow.json`
- `programs/solrival-escrow/target/types/solrival_escrow.ts`

Copy/import those here if you want Anchor `Program<SolrivalEscrow>` ergonomics
and on-chain account decoding. The discriminators they contain will match the
ones this SDK already computes (verified by test).
