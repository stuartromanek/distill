# Setlist image eval report

## Summary

| Metric | Value |
|--------|-------|
| Parse extracted | 30 |
| Ground truth rows | 30 |
| Parse recall | 30/30 |
| Matched (≥0.75) | 29 |
| Ambiguous | 1 |
| Not found | 0 |

## Follow-up plan triggers

- **Plan A**: (none)
- **Plan B**: old-97s-champaign
- **Plan C**: (none)
- **Plan D**: (none)
- **Plan E**: (none)
- **Plan F**: (none)
- **Plan G**: (none)
- **Plan I**: (none)

## Per-song results

| # | Artist | Title | Status | Score | Strategy | Best Tidal match | Notes |
|---|--------|-------|--------|-------|----------|------------------|-------|
| 1 | TEENAGE FANCLUB | What You Do To Me | matched | 1.00 | search-combined | Teenage Fanclub — What You Do To Me | - |
| 2 | SUPERCHUNK | Good Dreams | matched | 1.00 | search-combined | Superchunk — Good Dreams | - |
| 3 | FUGAZI | Public Witness Program | matched | 1.00 | search-combined | Fugazi — Public Witness Program - NYC NY 09/24/93_FLS0593 | - |
| 4 | CHARLY BLISS | Percolator | matched | 1.00 | search-combined | Charly Bliss — Percolator | - |
| 5 | BUILT TO SPILL | Big Dipper | matched | 1.00 | search-combined | Built To Spill — Big Dipper | - |
| 6 | MILDRED | Fish Sticks | matched | 1.00 | search-combined | Mildred — Fish Sticks | - |
| 7 | DEER TICK | Let's Go Dancing | matched | 1.00 | artist-album-browse | Deer Tick — Let’s Go Dancing | - |
| 8 | HOVVDY | Jean | matched | 1.00 | search-combined | Hovvdy — Jean | - |
| 9 | THE DANDY WARHOLS | Ride | matched | 1.00 | search-combined | The Dandy Warhols — Ride | - |
| 10 | THE SOFT BOYS | I Wanna Destroy You | matched | 1.00 | search-combined | The Soft Boys — I Wanna Destroy You | - |
| 11 | THE TRAGICALLY HIP | Vaccination Scar | matched | 1.00 | search-combined | The Tragically Hip — Vaccination Scar | - |
| 12 | THE SMASHING PUMPKINS | Frail & Bedazzled | matched | 1.00 | search-combined | Smashing Pumpkins — Frail & Bedazzled | - |
| 13 | THE VASELINES | Son Of A Gun | matched | 1.00 | search-combined | The Vaselines — Son of a Gun | - |
| 14 | R.E.M. | Good Advices | matched | 1.00 | search-combined | R.E.M. — Good Advices | - |
| 15 | ELLIOTT SMITH | Son Of Sam | matched | 1.00 | search-combined | Elliott Smith — Son Of Sam | - |
| 16 | OLD 97'S | Champaign, Illinois | ambiguous | 0.60 | search-combined | Carl Perkins — Champaign, Illinois | homonym_wrong_artist |
| 17 | LISSY TRULLIE | Boy Boy | matched | 1.00 | search-combined | Lissy Trullie — Boy Boy | - |
| 18 | SPARKLEHORSE | Sick Of Goodbyes | matched | 1.00 | search-title | Sparklehorse — Sick Of Goodbyes | - |
| 19 | CROOKED FINGERS | Call to Love | matched | 1.00 | search-combined | Crooked Fingers — Call To Love | - |
| 20 | THE WEIGHT | Job to Do | matched | 1.00 | search-title | The Weight — Job to Do | - |
| 21 | WILCO | I Got You - Dobro Mix Warzone | matched | 0.91 | search-combined | Wilco — I Got You (At the End of the Century) [Live at the Boulder Theater, Boulder, CO 11/1/99] | - |
| 22 | THE REPLACEMENTS | Unsatisfied | matched | 1.00 | search-combined | The Replacements — Unsatisfied | - |
| 23 | FOO FIGHTERS | Big Me | matched | 1.00 | search-combined | Foo Fighters — Big Me | - |
| 24 | J MASCIS | See You At The Movies | matched | 1.00 | search-title | J Mascis — See You At The Movies | - |
| 25 | VAN MORRISON | Purple Heather | matched | 1.00 | search-combined | Van Morrison — Purple Heather | - |
| 26 | WHITE FENCE | Your Eyes | matched | 1.00 | search-combined | White Fence — Your Eyes | - |
| 27 | DRIVE-BY TRUCKERS | Outfit | matched | 1.00 | search-combined | Drive-By Truckers — Outfit | - |
| 28 | OLDSTAR | Whiskey | matched | 1.00 | search-combined | oldstar — Whiskey | - |
| 29 | THE JAYHAWKS | All The Right Reasons | matched | 1.00 | search-combined | The Jayhawks — All The Right Reasons (Rotterdam) | - |
| 30 | JUSTIN TOWNES EARLE | Graceland | matched | 1.00 | search-combined | Justin Townes Earle — Graceland | - |

## Unmatchable / failed rows

### OLD 97'S — Champaign, Illinois
- Status: ambiguous
- Reason: homonym_wrong_artist
- Query: `OLD 97'S Champaign, Illinois`
- Top candidates:
  - Carl Perkins — Champaign, Illinois (0.60, id 4918155)
  - Dan Fogelberg — Illinois (0.51, id 1886393)
  - Michel Montecrossa — Champaign, Illinois (0.45, id 138341228)
  - The Guy Who Sings Songs About Cities & Towns — Champaign, Illinois (0.45, id 32235781)
  - The Cheatin' Hearts — Drinkin' Beer in Champaign, Illinois (0.38, id 338527415)
- No alternate strategy reached ≥0.75 (possible Tidal catalog gap)
