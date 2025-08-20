# CMRO2CSV
Scrape CMRO and save in CSV

## Usage

### Scraping
```sh
npx cmro2csv scrape <character id>
```

The character ID can be found in the CMRO URL 

```
https://cmro.travis-starnes.com/character_details.php?character=26106&order_listing=1&list_type=1&limit=30
```

```
character=26106
```

### Merge CSVs
```sh
npx cmro2csv merge <files ...> -o <output csv file>
```