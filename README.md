# TL07 - Boost your AEM Search

## Agenda
[Chapter 01 - Boostrap](#chapter-01---bootstrap)  
[Chapter 02 - Search fundamentals](#chapter-02---search-fundamentals)  
[Chapter 03 - Suggestions](#chapter-03---suggestions)  
[Chapter 04 - Spellcheck](#chapter-04---spellcheck)  
[Chapter 05 - Analyzers](#chapter-05---analyzers)  
[Chapter 06 - Boosting](#chapter-06---boosting)  
[Chapter 07 - Smart Tags](#chapter-07---smart-tags)  
[Chapter 08 - Smart Translation](#chapter-08---smart-translation)  
[Chapter 09 - Diagnosis](#chapter-09---diagnosis)  

## Chapter 01 - Bootstrap

### AEM Start
Start AEM by executing the following command  
```java -Xmx6G -jar cq-quickstart-*.jar -nobrowser -nofork```

Using Chrome, log in to AEM Author at http://localhost:4502/
* User name: admin
* Password: admin

### Content package
Install content package which contains some assets.

### Developer Tools
#### Index Manager
Web console that facilitates and reviewing high-level Oak index configurations.
- AEM > Tools > Operations > Diagnosis > [Index Manager](http://localhost:4502/libs/granite/operations/content/diagnosistools/indexManager.html)

#### Query Performance & Explain Query
Web console that lists recent slow and popular queries and provides detailed execution details for a specific query.
- AEM > Tools > Operations > Diagnosis > [Query Performance](http://localhost:4502/libs/granite/operations/content/diagnosistools/queryPerformance.html)

#### :information_source: Re-indexing Oak Indexes via Index Manager
Throughout this lab, re-indexing of the /oak:index/damAssetLucene will be required to make configuration changes to take effect.  

Below are the steps required to re-index the damAssetLucene index.
1. Open the */oak:index/damAssetLucene* node in the [CRXDE Lite](http://localhost:4502/crx/de/index.jsp#/oak%3Aindex/damAssetLucene)
2. Set *reindex* property to **true**
3. Once re-index finished, the *reindex* property value must be equal to **false** and *reindexCount* incremented

## Chapter 02 - Search fundamentals
AEM search supports robust full-text search, provided by the Apache Lucene. 

Lucene property indixes are at the core of AEM Search and must be well understood. This exercise covers:

*	Definition of the OOTB damAssetLucene Oak Lucene property index
*	Search query inspection
*	Full-text search operators

### Exercise

#### Perform a full-text search on Assets
1. Navigate to AEM > Assets > [File](http://localhost:4502/assets.html/content/dam)
2. Select Filter on the left (Alt+5 shortcut can be used)
![](images/filter-assets.png)
3. Filter by Files only (and not Folders) and type the term *mountain*
![](images/search-assets.png)
4. Find the executed query in the **Popular Queries** tab of [Query Performance](http://localhost:4502/libs/granite/operations/content/diagnosistools/queryPerformance.html) 
![](images/query-performance.png)
5. Select the query and perform the explain
![](images/explain-query.png)

#### Inspecting the damAssetLucene index definition
1.	Open [CRXDE Lite](http://localhost:4502/crx/de)
2.	Select /oak:index/damAssetLucene node
3.	Core index configurations are on damAssetLucene 
4.	Full-text aggregate configuration are defined under damAssetLucene/aggregates
5.	Property specific configurations are defined under damAssetLucene/indexRules
![](images/assets-index.png)

#### Full-text operations
Try out the following full-text searches using the supported operators and note the changes in results:
1. Group phrases: `mountain biking`
2. Group phrases with using double-quotes: `"mountain biking"`
3. OR operator: `mountain OR biking`
4. AND operator: `mountain AND biking`

## Chapter 03 - Suggestions
## Chapter 04 - Spellcheck
## Chapter 05 - Analyzers
## Chapter 06 - Boosting
## Chapter 07 - Smart Tags
## Chapter 08 - Smart Translation
## Chapter 09 - Diagnosis
