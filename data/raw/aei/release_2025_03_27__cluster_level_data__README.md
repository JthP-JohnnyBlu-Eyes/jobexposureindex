# Cluster Level Data

This folder contains cluster level data for the second Economic Index release associated with Claude 3.7 Sonnet Data. It contains hierarchical cluster descriptions, as well as associated prevalence metrics for each cluster (% of records, % of users). It also includes mappings to [O*NET Tasks](https://www.onetonline.org/), collaboration pattern ratios, and ratios associated with whether or not Claude Sonnet 3.7's "Thinking" feature was used during the conversation.

## Files in this Directory

- **cluster_level_dataset.tsv**: Tab-separated values file containing the cluster data with all fields described in the data dictionary below. This is the primary dataset file for analysis.

- **cluster_level_example_analysis.ipynb**: Jupyter notebook demonstrating example analyses you can perform with the cluster level dataset. This notebook includes code for loading the data, basic exploratory analysis, and visualization techniques to help understand the cluster patterns and their relationships to O*NET tasks.

## Data Dictionary

| Field | Description |
|-------|-------------|
| cluster_name_0 | Name of the level 0 (most granular) cluster |
| cluster_description_0 | Detailed description of the level 0 cluster |
| cluster_name_1 | Name of the level 1 (intermediate) cluster |
| cluster_description_1 | Detailed description of the level 1 cluster |
| cluster_name_2 | Name of the level 2 (broadest) cluster |
| cluster_description_2 | Detailed description of the level 2 cluster |
| percent_records | Percentage of total records that belong to this Level 0 cluster |
| percent_users | Percentage of total users who have used this Level 0 cluster |
| onet_task | Description of the associated O*NET task |
| collaboration:directive_ratio | Ratio of conversations with directive collaboration patterns |
| collaboration:feedback loop_ratio | Ratio of conversations with feedback loop collaboration patterns |
| collaboration:learning_ratio | Ratio of conversations with learning collaboration patterns |
| collaboration:none_ratio | Ratio of conversations with no collaboration patterns |
| collaboration:task iteration_ratio | Ratio of conversations with task iteration collaboration patterns |
| collaboration:validation_ratio | Ratio of conversations with validation collaboration patterns |
| has_thinking_ratio | Ratio of conversations where the "Thinking" feature was used |

## Bucketing Adjustment

For percent_records and percent_users fields, we applied a bucketing adjustment to enhance privacy while preserving the overall distribution:

1. Clusters were sorted by their prevalence metrics (percent_records and percent_users).
2. 100 buckets were created.
3. Clusters were assigned to buckets and the average prevalence within each bucket was calculated.
4. The original values were replaced with the bucket averages to reduce precision while maintaining the distribution.



