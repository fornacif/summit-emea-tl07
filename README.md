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

## Chapter 01 - Boostrap

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

* AEM > Tools > Operations > Diagnosis > Index Manager
* http://localhost:4502/libs/granite/operations/content/diagnosistools/indexManager.html

#### Query Performance & Explain Query
Web console that lists recent slow and popular queries and provides detailed execution details for a specific query.

*	AEM > Tools > Operations > Diagnosis > Query Performance
*	http://localhost:4502/libs/granite/operations/content/diagnosistools/queryPerformance.html

#### :information_source: Re-indexing Oak Indexes via Index Manager
Throughout this lab, re-indexing of the /oak:index/damAssetLucene will be required to make configuration changes to take effect.  

Below are the steps required to re-index the damAssetLucene index.
1. Open CRX/DE console: http://localhost:4502/crx/de/index.jsp#/oak%3Aindex/damAssetLucene
2. Set *reindex* property to **true**
3. Once re-index finished, the *reindex* property value must be equal to **false** and *reindexCount* incremented

## Chapter 02 - Search fundamentals
AEM search supports robust full-text search, provided by the Apache Lucene. 

Lucene property indixes are at the core of AEM Search and must be well understood. This exercise covers:

*	Definition of the OOTB damAssetLucene Oak Lucene property index
*	Search query inspection
*	Full-text search operators

### Exercise
#### Understand the query

Perform a fulltext search on the term *mountain* on assets
* AEM > Assets > File
* Navigate to Assets root folder: http://localhost:4502/assets.html/content/dam
* Search the term *mountain*
[Search asset](images/search-asset.png)


## Chapter 03 - Suggestions
## Chapter 04 - Spellcheck
## Chapter 05 - Analyzers
## Chapter 06 - Boosting
## Chapter 07 - Smart Tags
## Chapter 08 - Smart Translation
## Chapter 09 - Diagnosis
