# Data description for "What work can robots do?"

This file describes the data release accompanying "What work can robots do?". The data
consist of task and occupation robot exposure ratings. Tasks come from the U.S. Department
of Labor's O\*NET database. Claude Opus 5 (with web search) rated the O\*NET 29.3 tasks that
were classified as physical, as of 2026.

## Source Files

| File | Unit of observation | Rows | Description |
| :---- | :---- | ----: | :---- |
| `robot_exposure_occupations.csv` | O\*NET occupation | 923 | The robot exposure index for each occupation. |
| `robot_exposure_tasks.csv` | O\*NET task | 18,796 | The robot exposure rating for each task. |

Both files are UTF-8 CSV with a header row. The two files join on `onetsoc_code`. Within
the tasks file, (`onetsoc_code`, `task_id`) is unique. Numbers are rounded to 4
decimal places.

## Occupations File Schema

Each row is one O\*NET 29.3 occupation with task statements. The 93 O\*NET-SOC
codes without task statements (74 "All Other" codes and 19
military occupations) are not included.

| Column | Type | Description |
| :---- | :---- | :---- |
| `onetsoc_code` | string | O\*NET-SOC 2019 occupation code, for example `53-3054.00`. |
| `occupation_title` | string | O\*NET occupation title. |
| `robot_exposure_index` | float | Robot exposure index, 0 to 3. The average of the occupation's task scores (`E1` = 1, `E2` = 2, `E3` = 3, otherwise 0), weighting each task by its time share. |

## Tasks File Schema

Each row is one task of one occupation. All tasks are included.

| Column | Type | Description |
| :---- | :---- | :---- |
| `onetsoc_code` | string | O\*NET-SOC 2019 occupation code. |
| `occupation_title` | string | O\*NET occupation title. |
| `task_id` | string | O\*NET task ID. |
| `task_statement` | string | O\*NET task statement. |
| `time_share` | float | Claude's estimate of the share of the occupation's working time spent on the task. Sums to 1 within each occupation, up to rounding. |
| `physical` | string | `Yes` if the task is physical (see Physical Tasks below), else `No`. |
| `exposure_tier` | string | Exposure tier of a physical task, `E0` to `E3` (see Exposure Tiers below). Empty if the task is not physical. |
| `reasoning` | string | Claude's explanation of the task's tier. For a task Claude found not physical, why it is not physical. Empty for tasks that were not rated. |
| `instances` | JSON list | The representative task instances Claude rated (see Task Instances below). |
| `sources` | JSON list | The sources Claude cited (see Sources below). Empty for tasks that were not rated or that cite no source. |

Up to rounding, an occupation's `robot_exposure_index` equals the sum over its rows of
`time_share` times the score of `exposure_tier` (`E1` = 1, `E2` = 2, `E3` = 3; 0 for `E0`
and for an empty tier).

## Exposure Tiers

Task exposure is rated by the kind of environment in which a robot could perform the task.
Task exposure is the highest exposure level for which more than half of instances by weight
are exposed at that level or higher.

| `exposure_tier` | Score | Environment | Description | Tasks |
| :---- | :---: | :---- | :---- | ----: |
| `E0` | 0 | No environment | No cited system could complete the instance even in a purpose-built setting. | 2,419 |
| `E1` | 1 | Purpose-built robotic work environment | A setting built for the machine: fixtures hold each workpiece in a known position, conveyors present inputs one way, fences or light curtains keep people out. Examples: a fenced machine-tending cell, a bottling line, an automotive paint booth. Mark of E1: the setting is built around the machine, not around people. | 3,967 |
| `E2` | 2 | Structured human work facility | A setting built for human work and kept predictable: a fixed layout, standard equipment, and an institution that controls who and what is present. It may be indoor or outdoor. Examples: a hospital pharmacy, a hotel corridor, an airport concourse, a container port. Mark of E2: an institution controls the premises and keeps them to a working standard. | 1,103 |
| `E3` | 3 | Unstructured environment | A setting taken as found: the layout differs site to site, novel objects appear, and conditions are not kept to any standard. Examples: a private home, a construction site, a public sidewalk. Mark of E3: no institution controls the setting or keeps it to a working standard. | 105 |

## Physical Tasks

Physical tasks are defined in Appendix A using task ratings on physical, cognitive, and
interpersonal work. Exposure is rated for all of these tasks. In total, 7,594 tasks are
physical; this number excludes 432 tasks for which exposure was rated but the exposure
rating found that the task is not physical.

## Task Instances

`instances` is a JSON list with one object per instance.

| Field | Type | Description |
| :---- | :---- | :---- |
| `instance` | int | Instance number within the task, from 0. |
| `description` | string | Description of the task instance. |
| `weight_pct` | int | Share of the task's occurrences, in percent (multiples of 5, summing to 100 within a task). |
| `tier` | string | Highest tier at which a cited robot could complete the instance, `E0` to `E3`. |
| `setting_tier` | string | Tier of the instance's setting. |
| `environment` | string | The setting in which the decisive cited robot actually operates. |
| `sources` | string | Cited `source` numbers for Claude's rating, comma-separated. |
| `reasoning` | string | Claude's explanation of the instance's tier. |

## Sources

`sources` is a JSON list with one object per cited source.

| Field | Type | Description |
| :---- | :---- | :---- |
| `source` | int | Source number within the task, from 0. |
| `system` | string | The robot or robotic system. |
| `developer` | string | Its developer. |
| `date` | string | When the demonstration or deployment took place (may be approximate). |
| `maturity` | string | `deployed`, `commercial`, or `demo`. |
| `autonomy_status` | string | `autonomous`, `teleoperated`, or `unclear`. |
| `claim` | string | Claude's claim about this source. |
| `source_title` | string | Title of the source. |
| `url` | string | URL of the source. |
| `quote` | string | The first 5 words of the passage Claude quoted from the source. |
| `transfer_justification` | string or null | Used when Claude cites a robot that performs a related task, to explain why it applies to this task. |

The file holds 56,933 sources: 20,877 `deployed`, 25,743 `commercial`,
and 10,313 `demo`.

## Quotes

Quotes from sources are cut to their first 5 words and end with "...". This
applies to the `quote` field and to any passage of more than 5 words in
quotation marks in the other text fields. O\*NET task statements and work activity titles
are quoted in full. Claude's response text sometimes repeats a source's words without
quotation marks; any string of more than 5 consecutive words that appears in a
full source quote is cut from Claude's response text.

## License

Data released under CC BY 4.0.

This release includes information from the O\*NET 29.3 Database by the U.S. Department of
Labor, Employment and Training Administration (USDOL/ETA), used under the CC BY 4.0
license. O\*NET® is a trademark of USDOL/ETA. Anthropic has modified all or some of this
information. USDOL/ETA has not approved, endorsed, or tested these modifications.

## Contact

For press inquiries, contact press@anthropic.com. For all other questions, reach out to
econ-research@anthropic.com.

## Citation

```
@online{legateyang2026robots,
 author = {Legate-Yang, Russell and Massenkoff, Maxim},
 title = {What work can robots do?},
 date = {2026-09-30},
 year = {2026},
 url = {https://www.anthropic.com/research/what-work-can-robots-do}
}
```
