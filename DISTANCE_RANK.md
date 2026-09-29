### distance is how close the chunk is to the question.

near 0 it is so close , around 0.4 or higher : weak

why is this useful to know : if a chunk distance and low and the model refuse to answer (null) in our case means
the prompt is so strict

high distance means the retrieval didnt find the right content.

## Rank: the chunk's position in the list
    The search returns chunks sorted closest first. Rank is the position: 0 is the first chunk given to the model, 1 is the second, and so on. It matches the --- Chunk N --- number in the prompt.

Why it's useful: if the chunk with the real answer keeps showing up at rank 9 instead of rank 0, your retrieval ordering needs work.

ORDER BY embedding <=> CAST(:embedding AS vector)
LIMIT :limit
<=> is the distance, so Postgres returns the closest chunk first. Rank is just distance sorted. Postgres doesn't decide anything on its own, though. It only compares two vectors, and what you control is what goes into those vectors:

### IMPORT TO ADD LATER
Discussed but not built: marking which chunks the model actually used (a chunks : 0, 3 line from the model plus a used flag). That's your call for later.

this will help with model performance;  (if it only need the first 3 chunks we will send only 3 to cut the noise from the  other, if chunks 9-11  we used it means there is a problem with our chunks retrieval)

### important : when we upload a specefic file that have phova pumps names in it it wont show in the chunks because we are searching for competitors names.
