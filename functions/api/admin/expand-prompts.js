// ONE-TIME TOOL: makes the ~2,500 very short prompts (under 200 characters) longer
// and more useful, using the Gemini API the site already uses (GEMINI_API_KEY).
//
// Open  /api/admin/expand-prompts  (admin login needed) -> a small control page:
//   [Test 3 prompts]  shows 3 before/after results, saves NOTHING
//   [Start auto-run]  processes 12 prompts per step, thinnest first, until done
//   [Stop]            you can stop and continue another day - progress is remembered
//   [Show 5 changes]  spot-check the latest saved rewrites
//   [Undo everything] restores every changed prompt from the backup table
//
// Safety: slugs/URLs never change; old text is saved first (table prompt_expand_backup);
// each rewrite must keep every [PLACEHOLDER], be 300-1100 characters, stay on topic and
// contain no links/markdown - otherwise it is rejected and the old text stays.
// DELETE THIS FILE from the repo when everything is done.
import { requireAuth } from '../../_auth.js';

const IDS = [175,287,315,370,376,26,28,62,83,98,207,311,82,97,355,21,58,208,210,211,288,34,37,57,31,52,107,121,176,362,416,60,956,203,314,1568,129,181,354,35,63,103,131,309,351,53,179,419,623,27,36,54,134,289,312,364,285,32,202,204,306,307,313,1015,2366,353,65,299,308,310,581,1171,2493,286,359,657,791,84,99,130,304,368,2073,24,77,81,92,96,349,1206,1862,2576,300,2577,298,606,1677,1778,1820,2023,2115,2660,23,283,2111,2786,290,291,577,1654,2452,2982,276,282,302,1469,1779,2828,78,93,297,347,415,616,874,1733,1821,2057,2760,2814,2912,2954,301,587,1076,1120,1398,1442,1539,1822,1912,2158,173,303,601,763,880,894,966,1564,1736,1780,1863,2072,2830,49,75,90,112,281,1354,1818,1890,1947,1959,2021,2241,2325,2508,2534,79,94,910,1352,1672,1904,1905,2096,2367,2494,1213,1652,1694,1948,2030,2283,2614,2644,2844,3051,360,705,929,1010,1221,1796,2031,2087,2620,2870,2871,102,109,816,923,1031,1212,1353,1622,1691,1946,2134,2156,2817,2872,1,110,859,1210,1610,1699,1990,2106,2302,2409,2410,2618,2824,2950,48,128,258,582,609,615,639,919,1000,1026,1027,1528,1565,2032,2213,2326,2766,2970,2992,22,174,967,1084,1211,1653,1961,1965,2180,2198,2289,2619,2745,2807,20,605,924,945,949,1184,1804,1926,1937,1949,1978,2037,2282,2368,2459,2471,2729,2884,305,367,624,839,1486,1620,1678,1847,1956,1989,2004,2062,2141,2387,2443,2492,2533,2639,2702,113,593,607,725,863,1145,1304,1443,1479,1569,1665,1681,1760,1793,1811,2240,2313,2561,2698,2703,2704,2771,2796,2829,2908,2913,16,117,585,861,1083,1172,1178,1467,1570,1579,1634,1721,1857,1906,1925,1988,2090,2200,2284,2333,2357,2385,2393,2395,2451,2510,2613,2687,2894,51,108,675,678,779,890,898,939,984,997,1013,1066,1386,1425,1474,1705,1853,1877,1878,1918,1936,2010,2052,2104,2121,2264,2329,2404,2513,2609,2677,2788,2952,2956,126,358,659,664,723,730,854,947,974,983,1057,1189,1554,1700,1768,1807,1867,1873,2085,2122,2181,2422,2535,2693,2933,361,631,692,1067,1105,1244,1274,1424,1453,1481,1484,1508,1521,1523,1612,1617,1636,1731,1789,1887,2058,2135,2253,2306,2376,2572,2718,2746,2791,563,575,644,671,686,792,804,847,937,1411,1421,1526,1695,1900,1901,1976,2036,2110,2114,2261,2295,2390,2408,2474,2761,2939,2965,101,589,648,667,765,836,856,888,930,1124,1192,1220,1307,1399,1444,1470,1527,1595,1611,1631,1632,1638,1642,1706,1737,1751,1767,1819,1864,1950,2074,2082,2219,2315,2456,2479,2490,2505,2645,2661,2758,2765,2787,2790,2800,2949,2984,278,284,551,969,1041,1045,1080,1109,1115,1198,1245,1310,1388,1458,1537,1602,1623,1668,1766,1874,1975,1985,1996,2025,2039,2044,2099,2109,2224,2356,2383,2396,2624,2671,2769,2797,2853,2914,2962,2964,2967,741,803,826,840,852,866,900,922,950,1062,1088,1130,1357,1414,1533,1552,1762,1817,1880,1886,1902,2028,2078,2081,2097,2128,2188,2299,2339,2363,2446,2504,2516,2538,2553,2578,2673,2681,2685,2854,18,558,629,700,828,843,884,902,1044,1063,1072,1107,1108,1269,1300,1404,1449,1456,1858,1859,1872,1932,1968,1973,2086,2088,2138,2268,2292,2324,2425,2426,2463,2480,2524,2528,2531,2603,2650,2696,2734,2959,696,736,810,841,955,1008,1214,1247,1263,1283,1359,1485,1599,1626,1723,1725,1784,1791,1830,1868,1962,1987,1992,2042,2098,2116,2124,2125,2157,2222,2258,2272,2375,2432,2460,2488,2648,2651,2882,106,120,125,348,574,588,729,1007,1014,1022,1042,1047,1071,1113,1118,1121,1281,1314,1336,1439,1704,1720,1808,1813,1825,1943,1972,1979,2040,2080,2202,2350,2406,2418,2424,2478,2481,2526,2582,2697,2744,2784,2816,2923,2991,69,72,87,275,548,655,790,815,885,913,1046,1081,1122,1132,1168,1200,1216,1346,1347,1382,1397,1438,1452,1701,1724,1761,1787,1860,2063,2159,2225,2242,2254,2303,2352,2359,2374,2437,2482,2497,2580,2610,2713,2723,2750,2806,2825,2834,2938,2968,17,50,80,95,545,556,598,611,628,638,650,739,780,877,878,961,977,1078,1166,1176,1203,1355,1420,1448,1455,1718,1803,1854,1934,1994,2103,2142,2197,2199,2207,2256,2300,2304,2328,2335,2340,2345,2373,2416,2429,2441,2484,2495,2547,2551,2563,2616,2716,2847,2909,2921,2986,104,561,596,654,873,891,948,1005,1074,1079,1153,1271,1275,1289,1296,1306,1468,1598,1630,1643,1659,1660,1670,1676,1786,1832,1843,1865,1955,1977,2020,2046,2061,2117,2130,2194,2218,2231,2336,2370,2372,2379,2411,2457,2466,2536,2574,2690,2740,2762,2773,2789,2845,2911,2955,2957,2993,559,614,643,685,769,793,1004,1016,1036,1051,1082,1098,1110,1143,1158,1160,1215,1258,1303,1305,1407,1408,1447,1475,1489,1534,1685,1692,1740,1749,1799,1929,1980,1998,2033,2067,2164,2190,2212,2249,2320,2362,2364,2415,2450,2462,2477,2523,2530,2542,2775,2895,2940,2948,46,603,619,620,684,701,767,813,869,870,871,909,1069,1092,1151,1175,1218,1292,1315,1378,1387,1400,1547,1572,1581,1583,1645,1661,1673,1686,1726,1836,1839,1942,1984,1999,2038,2145,2152,2177,2238,2285,2298,2355,2378,2467,2485,2486,2584,2607,2656,2664,2686,2735,2736,2741,2743,2755,2768,2839,2861,2897,2928,133,259,595,682,699,749,750,755,758,848,872,879,886,887,927,963,1018,1043,1056,1123,1264,1403,1517,1531,1613,1680,1702,1715,1829,1834,1866,1892,1935,1951,1983,2008,2015,2161,2208,2246,2255,2278,2346,2399,2502,2525,2556,2642,2676,2688,2712,2730,2795,2802,2808,2930,2985,569,677,683,820,855,925,960,1025,1134,1229,1266,1295,1317,1427,1461,1515,1530,1590,1615,1688,1696,1713,1738,1769,1792,1828,1835,1915,1953,2029,2064,2112,2127,2155,2186,2291,2342,2403,2496,2662,2728,2812,2815,2867,2885,2943,2945,2960,2963,327,555,610,612,691,757,761,808,862,957,979,1002,1006,1035,1049,1060,1064,1073,1097,1139,1146,1156,1196,1251,1299,1302,1313,1323,1348,1351,1362,1363,1369,1451,1483,1488,1491,1500,1551,1557,1600,1666,1667,1690,1693,1774,1794,1897,1940,1974,2022,2095,2132,2139,2182,2338,2401,2447,2600,2602,2621,2668,2689,2706,2719,2749,2776,2852,2915,2922,280,554,735,892,926,938,959,972,1068,1090,1112,1152,1169,1173,1193,1262,1267,1293,1422,1450,1476,1529,1639,1641,1675,1689,1739,1913,1966,1967,1991,2143,2149,2209,2251,2273,2290,2337,2348,2371,2465,2527,2589,2606,2627,2720,2739,2779,2849,2878,2927,2942,74,89,339,647,656,794,831,876,908,911,912,941,953,985,992,1054,1155,1161,1182,1209,1217,1233,1288,1327,1332,1370,1435,1463,1471,1518,1535,1559,1582,1585,1608,1624,1719,1744,1851,1954,1993,2163,2167,2245,2248,2277,2312,2388,2405,2564,2636,2646,2709,2717,2754,2774,2783,2804,2879,2890,2899,2910,2919,43,105,573,578,713,728,743,834,846,864,903,915,928,931,1001,1019,1278,1318,1337,1384,1385,1434,1459,1543,1618,1635,1655,1684,1697,1716,1728,1754,1850,1903,1923,1941,1957,2041,2101,2118,2147,2227,2233,2236,2280,2296,2332,2351,2353,2472,2512,2560,2575,2594,2655,2700,2838,2891,15,47,273,544,672,711,721,800,973,1011,1091,1249,1277,1406,1416,1446,1525,1561,1662,1703,1722,1734,1812,1894,1920,2007,2019,2027,2079,2092,2119,2120,2185,2205,2230,2247,2270,2301,2308,2442,2453,2468,2503,2532,2565,2666,2669,2832,2866,2881,2886,2896,2972,274,357,660,673,680,784,796,801,807,853,904,1023,1136,1328,1503,1511,1512,1592,1596,1621,1650,1683,1698,1710,1727,1840,1875,1881,1939,1944,2026,2102,2123,2168,2217,2229,2267,2307,2392,2427,2435,2469,2487,2517,2615,2622,2623,2632,2634,2640,2649,2658,2692,2699,2757,2782,2859,2883,76,91,277,338,366,562,698,764,770,835,837,858,978,1103,1150,1157,1194,1207,1261,1326,1379,1391,1417,1418,1430,1589,1651,1746,2189,2214,2232,2287,2317,2330,2344,2354,2377,2386,2407,2434,2448,2449,2455,2501,2511,2541,2571,2586,2626,2652,2691,2695,2733,2748,2820,2906,2926,2936,626,703,753,774,798,819,906,914,999,1149,1197,1246,1320,1371,1401,1482,1492,1524,1538,1563,1571,1640,1647,1663,1671,1732,1745,1827,1831,1842,1928,2011,2012,2077,2083,2094,2133,2150,2178,2216,2220,2228,2235,2269,2321,2369,2381,2402,2428,2438,2521,2573,2597,2638,2794,2856,111,114,328,640,653,674,679,827,993,1009,1012,1038,1129,1205,1231,1252,1309,1344,1464,1556,1560,1669,1682,1708,1741,1845,1870,2069,2169,2170,2266,2293,2309,2380,2382,2430,2454,2499,2515,2569,2643,2675,2678,2742,2778,2793,2798,2799,2813,2837,2875,2880,2932,119,571,604,613,617,690,702,720,781,809,814,838,889,899,933,942,958,1039,1040,1075,1141,1148,1276,1322,1349,1366,1494,1506,1536,1544,1587,1597,1664,1707,1810,1814,1816,1833,1884,1907,1931,1970,1986,2006,2024,2070,2071,2131,2153,2165,2175,2419,2440,2568,2585,2591,2630,2653,2701,2724,2770,2827,2858,2877,2892,2917,2924,2975,2990,565,570,722,734,742,762,771,797,806,812,844,895,897,954,975,1034,1065,1114,1170,1177,1179,1187,1222,1298,1377,1405,1548,1558,1625,1750,1771,1805,1841,1856,1938,1971,2002,2059,2075,2105,2201,2244,2279,2334,2461,2483,2519,2548,2684,2752,2846,2860,2862,2869,2903,550,584,618,805,833,851,865,968,987,1003,1087,1131,1144,1202,1236,1243,1259,1319,1330,1360,1374,1402,1429,1574,1577,1588,1601,1616,1729,1764,1795,1801,1891,1908,2076,2196,2257,2275,2281,2322,2389,2458,2522,2608,2659,2663,2674,2737,2772,2818,2863,2876,340,572,576,632,666,731,738,822,842,845,921,935,1117,1174,1183,1208,1248,1254,1294,1308,1312,1324,1358,1365,1413,1432,1573,1644,1658,1679,1687,1742,1763,1770,1815,1826,1846,1848,1896,1910,1911,1927,2013,2129,2271,2297,2365,2397,2421,2423,2439,2507,2514,2529,2544,2552,2559,2705,2747,2781,2826,2888,71,86,546,608,633,636,646,662,681,726,783,811,901,918,943,1024,1094,1137,1180,1190,1195,1237,1242,1436,1440,1462,1493,1516,1532,1594,1628,1637,1648,1709,1712,1755,1777,1781,1788,1861,1879,1883,1995,2014,2018,2166,2226,2262,2265,2327,2331,2361,2444,2590,2592,2625,2672,2842,2864,2934,2974,549,597,599,697,706,715,740,775,907,917,936,1028,1032,1077,1093,1186,1230,1284,1341,1460,1545,1586,1730,1889,1921,1958,2009,2034,2066,2068,2091,2100,2260,2288,2593,2667,2715,2764,2803,2831,2848,2920,2925,2973,543,893,896,989,994,1029,1050,1106,1147,1167,1188,1270,1335,1368,1549,1752,1758,1790,1823,1893,1924,2047,2050,2140,2144,2211,2259,2286,2358,2550,2628,2647,2822,2951,2953,2981,279,590,600,621,668,687,759,785,787,788,981,1086,1096,1119,1135,1140,1181,1201,1219,1232,1234,1286,1331,1394,1419,1423,1445,1629,1869,1982,2093,2113,2171,2174,2570,2617,2665,2670,2751,2805,2907,2941,2947,272,337,557,586,625,676,707,821,868,932,934,998,1055,1061,1070,1165,1227,1238,1279,1297,1333,1356,1553,1578,1603,1747,1757,1797,1930,2000,2001,2154,2172,2206,2223,2316,2323,2347,2384,2391,2470,2520,2537,2545,2596,2601,2654,2732,2868,2900,622,716,747,789,795,970,996,1037,1111,1265,1290,1380,1513,1776,1876,1888,1933,1997,2274,2341,2398,2417,2464,2476,2518,2554,2726,2887,541,542,980,1100,1125,1235,1273,1282,1339,1373,1495,1576,1627,1765,1773,1775,1849,2055,2137,2314,2414,2489,2539,2549,2555,2629,2759,2850,2855,2873,2966,73,88,602,641,652,669,712,717,772,850,962,986,1133,1199,1255,1257,1342,1392,1441,1472,1519,1546,1593,1714,1783,1802,1838,1895,1909,1964,2005,2016,2056,2237,2475,2557,2598,2731,2785,2851,2874,2902,44,635,714,746,754,756,799,867,1164,1225,1226,1343,1350,1383,1389,1437,1735,1844,2035,2043,2151,2250,2540,2595,2710,2711,2753,2777,2809,2857,2901,661,665,670,689,693,760,768,860,882,905,1020,1104,1241,1250,1260,1316,1465,1498,1510,1562,1575,1649,1782,1798,1800,1917,1952,2108,2136,2148,2184,2204,2318,2412,2473,2491,2498,2587,2738,2904,2969,116,335,336,594,704,748,773,883,946,990,1301,1364,1375,1501,1619,1743,1945,2051,2089,2160,2193,2215,2319,2588,2605,2721,2801,2841,2898,2918,2946,579,695,778,786,1017,1253,1280,1376,1393,1473,1505,1607,1711,1855,2003,2060,2191,2203,2221,2558,2567,2714,2763,2767,2833,2843,2931,260,663,710,745,751,971,1053,1163,1415,1431,1480,1520,1591,2017,2176,2192,2360,2394,2400,2637,2679,2958,583,627,752,766,825,881,995,1162,1268,1361,1409,1478,1898,1914,1960,2183,2243,2263,2413,2780,2889,2944,552,651,719,1052,1223,1540,1550,1852,1899,1922,2049,2054,2343,2611,2631,2707,2708,2819,2988,658,1272,1372,1381,1497,1499,1504,1541,1542,1584,1674,1916,2162,2500,2657,2722,2756,688,708,777,830,982,1021,1204,1396,1487,1657,1748,1772,1882,2084,2187,2445,2727,2823,2840,2916,2987,329,330,642,724,744,976,1033,1159,1340,1454,1567,1604,1759,1824,1919,2173,2543,2792,2810,2865,2929,694,988,1116,1410,1566,1609,1969,2210,2252,2276,2581,2599,2641,2682,2811,547,592,782,824,940,944,964,1142,1224,2146,2179,2420,2436,2562,2566,2694,100,567,709,718,727,818,823,1059,1256,1325,1395,1555,1614,1633,2065,2431,2835,42,591,645,733,737,920,1433,1457,1753,1756,2506,2509,2612,2680,118,857,951,1058,1099,1127,1154,1240,1338,1345,2836,2937,553,630,965,991,1101,1287,1522,1809,2195,2234,2579,296,326,346,732,832,1291,1311,1329,1367,1514,1605,2961,2971,568,637,802,1030,1126,1837,875,1321,1334,1656,2633,649,1048,1185,1428,1490,1885,2305,1717,2635,2935]; // ids of prompts that were under 200 characters, thinnest first
const MAXLEN = 200;       // only prompts still shorter than this are touched
const MIN_NEW = 300, MAX_NEW = 1100;
const DEFAULT_BATCH = 12;
const MODEL = 'gemini-3.6-flash'; // same model the rest of the site uses

const INSTRUCTION = `You improve entries for a free AI prompt library. Each input item is a SHORT prompt that people copy into ChatGPT, Claude or Gemini. Rewrite each one into a complete, genuinely useful prompt of about 350-700 characters.

Rules:
1. Keep the original goal and role of the prompt. Do not change what it is for.
2. Keep EVERY placeholder exactly as written, including the brackets and capital letters (for example [TOPIC]). Do not rename, remove or add placeholders.
3. Add real value: the audience or context to consider, the structure of the answer (sections, a table, numbered steps or a word limit), the tone, two or three specific things to cover, and one useful constraint (for example what to avoid, or to say clearly when unsure).
4. For image or banner prompts add subject details, lighting, style, composition, aspect ratio and what to avoid. No brand names, no real people, no copyrighted characters.
5. Never invent facts, statistics, prices, laws or sources. For health, money or legal topics say the answer is general information, not professional advice.
6. Plain text only: no markdown, no headings, no bullet symbols, no quotation marks around the prompt, no "Here is". Write the prompt itself, usually starting with "Act as" or "Create".
7. Keep the same language as the input.
8. Each rewritten prompt must be clearly different from the others, even when the inputs look similar.

Return JSON: {"items":[{"id":<same id>,"prompt":"<rewritten prompt>"}]} with exactly one entry per input item.`;

const json = (obj, status = 200) =>
  new Response(JSON.stringify(obj, null, 2), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
  });

const TOKEN_RE = /\[[^\[\]]{2,80}\]|\{\{[^{}]*\}\}/g;
const STOP = new Set('with that this from your have will into about their which what when where should would could also each more than them then they been were being make give using used need want just like only some such over under between include including create write prompt'.split(' '));

function contentWords(t) {
  return new Set((t.toLowerCase().match(/[a-z]{4,}/g) || []).filter(w => !STOP.has(w)));
}

function validate(oldText, newText) {
  if (typeof newText !== 'string') return 'not text';
  const t = newText.trim();
  if (t.length < MIN_NEW) return 'too short (' + t.length + ')';
  if (t.length > MAX_NEW) return 'too long (' + t.length + ')';
  if (t.length < oldText.length + 100) return 'barely longer than the original';
  if (/```|https?:\/\/|^#{1,6}\s|^\s*[-*•]\s/m.test(t)) return 'contains markdown or a link';
  if (/^(here is|here's|sure|okay|certainly)\b/i.test(t)) return 'starts with chatter';
  const oldTok = oldText.match(TOKEN_RE) || [];
  const newTok = t.match(TOKEN_RE) || [];
  for (const tok of oldTok) if (!t.includes(tok)) return 'lost placeholder ' + tok;
  const extra = newTok.filter(x => !oldTok.includes(x));
  if (oldTok.length && extra.length) return 'added placeholder ' + extra[0];
  if (!oldTok.length && extra.length > 3) return 'too many new placeholders';
  const ow = contentWords(oldText);
  if (ow.size >= 4) {
    const nw = contentWords(t);
    let hit = 0;
    for (const w of ow) if (nw.has(w)) hit++;
    if (hit / ow.size < 0.4) return 'drifted away from the original topic';
  }
  return null;
}

async function callGemini(env, rows) {
  const input = rows.map(r => ({ id: r.id, title: r.title, category: r.category, prompt: r.prompt }));
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 75000);
  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${env.GEMINI_API_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: ctrl.signal,
        body: JSON.stringify({
          contents: [{ parts: [{ text: INSTRUCTION + '\n\nINPUT:\n' + JSON.stringify(input) }] }],
          generationConfig: {
            thinkingConfig: { thinkingLevel: 'low' },
            maxOutputTokens: 8192,
            temperature: 0.5,
            responseMimeType: 'application/json',
            responseSchema: {
              type: 'OBJECT',
              properties: {
                items: {
                  type: 'ARRAY',
                  items: {
                    type: 'OBJECT',
                    properties: { id: { type: 'INTEGER' }, prompt: { type: 'STRING' } },
                    required: ['id', 'prompt'],
                  },
                },
              },
              required: ['items'],
            },
          },
        }),
      }
    );
    if (res.status === 429) return { error: 'rate_limited', detail: 'Gemini quota / rate limit reached - wait a few minutes (or until tomorrow) and press Start again.' };
    if (!res.ok) return { error: 'gemini_error', detail: (await res.text()).slice(0, 300) };
    const data = await res.json();
    const text = data?.candidates?.[0]?.content?.parts?.[0]?.text || '';
    let parsed;
    try { parsed = JSON.parse(text); } catch (e) { return { error: 'bad_json', detail: 'Model did not return valid JSON.' }; }
    return { items: Array.isArray(parsed.items) ? parsed.items : [] };
  } catch (e) {
    return { error: 'timeout', detail: 'Model call failed or took too long: ' + String(e).slice(0, 120) };
  } finally {
    clearTimeout(timer);
  }
}

async function ensureTables(db) {
  await db.batch([
    db.prepare(`CREATE TABLE IF NOT EXISTS prompt_expand_backup (id INTEGER PRIMARY KEY, slug TEXT, old_prompt TEXT NOT NULL, new_prompt TEXT NOT NULL)`),
    db.prepare(`CREATE TABLE IF NOT EXISTS prompt_expand_failed (id INTEGER PRIMARY KEY, reason TEXT, tries INTEGER NOT NULL DEFAULT 0)`),
    db.prepare(`CREATE TABLE IF NOT EXISTS prompt_expand_state (k TEXT PRIMARY KEY, v INTEGER NOT NULL)`),
  ]);
}
async function getCursor(db) {
  const r = await db.prepare(`SELECT v FROM prompt_expand_state WHERE k = 'cursor'`).first();
  return r ? r.v : 0;
}
async function loadRows(db, ids) {
  if (!ids.length) return [];
  const ph = ids.map(() => '?').join(',');
  const { results } = await db.prepare(`SELECT id, slug, title, category, prompt FROM prompts WHERE id IN (${ph})`).bind(...ids).all();
  return results;
}

export async function onRequestGet(context) {
  const { request, env } = context;
  if (!(await requireAuth(request, env))) return json({ error: 'Not authorized' }, 401);
  const db = env.DB;
  const q = new URL(request.url).searchParams;
  const action = q.get('action');

  if (!action) {
    return new Response(PAGE, { headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' } });
  }
  if (!env.GEMINI_API_KEY) return json({ error: 'GEMINI_API_KEY secret is missing on the server.' }, 500);

  await ensureTables(db);

  if (action === 'status') {
    const cursor = await getCursor(db);
    const saved = (await db.prepare(`SELECT COUNT(*) AS n FROM prompt_expand_backup`).first()).n;
    const failed = (await db.prepare(`SELECT COUNT(*) AS n FROM prompt_expand_failed`).first()).n;
    return json({ total: IDS.length, cursor, saved, failed, remaining: Math.max(0, IDS.length - cursor) });
  }

  if (action === 'sample') {
    const { results } = await db.prepare(`SELECT slug, old_prompt, new_prompt FROM prompt_expand_backup ORDER BY rowid DESC LIMIT 5`).all();
    return json({ latest_changes: results });
  }

  if (action === 'rollback') {
    const res = await db
      .prepare(`UPDATE prompts SET prompt = (SELECT b.old_prompt FROM prompt_expand_backup b WHERE b.id = prompts.id), updated_at = datetime('now') WHERE id IN (SELECT id FROM prompt_expand_backup)`)
      .run();
    await db.batch([
      db.prepare(`DELETE FROM prompt_expand_backup`),
      db.prepare(`DELETE FROM prompt_expand_failed`),
      db.prepare(`DELETE FROM prompt_expand_state`),
    ]);
    return json({ mode: 'ROLLED BACK', restored: (res.meta && res.meta.changes) || 0 });
  }

  if (action === 'test' || action === 'run') {
    const n = Math.max(1, Math.min(20, Number(q.get('n')) || (action === 'test' ? 3 : DEFAULT_BATCH)));
    const cursor = await getCursor(db);
    if (cursor >= IDS.length) return json({ done: true, remaining: 0, message: 'All prompts in the list are processed.' });
    const ids = IDS.slice(cursor, cursor + n);
    const rows = (await loadRows(db, ids)).filter(r => r.prompt.length < MAXLEN);
    const skipped = ids.length - rows.length; // deleted, or already longer than 200 characters

    let accepted = [], rejected = [];
    if (rows.length) {
      const out = await callGemini(env, rows);
      if (out.error) return json({ error: out.error, detail: out.detail, cursor, remaining: IDS.length - cursor }, out.error === 'rate_limited' ? 429 : 502);
      const byId = new Map(out.items.map(it => [Number(it.id), it.prompt]));
      for (const r of rows) {
        const np = byId.get(r.id);
        const why = np === undefined ? 'model skipped this prompt' : validate(r.prompt, np);
        if (why) rejected.push({ id: r.id, slug: r.slug, reason: why });
        else accepted.push({ id: r.id, slug: r.slug, title: r.title, old: r.prompt, next: np.trim() });
      }
    }

    if (action === 'test') {
      return json({
        mode: 'TEST - nothing was saved',
        accepted: accepted.map(a => ({ slug: a.slug, title: a.title, old: a.old, new: a.next, chars: a.next.length })),
        rejected,
      });
    }

    const stmts = [];
    for (const a of accepted) {
      stmts.push(db.prepare(`INSERT OR IGNORE INTO prompt_expand_backup (id, slug, old_prompt, new_prompt) VALUES (?, ?, ?, ?)`).bind(a.id, a.slug, a.old, a.next));
      stmts.push(db.prepare(`UPDATE prompts SET prompt = ?, updated_at = datetime('now') WHERE id = ? AND prompt = ?`).bind(a.next, a.id, a.old));
    }
    for (const r of rejected) {
      stmts.push(db.prepare(`INSERT INTO prompt_expand_failed (id, reason, tries) VALUES (?, ?, 1) ON CONFLICT(id) DO UPDATE SET reason = excluded.reason, tries = tries + 1`).bind(r.id, r.reason));
    }
    stmts.push(db.prepare(`INSERT INTO prompt_expand_state (k, v) VALUES ('cursor', ?) ON CONFLICT(k) DO UPDATE SET v = excluded.v`).bind(cursor + ids.length));
    await db.batch(stmts);

    return json({
      mode: 'RUN',
      saved: accepted.length,
      rejected: rejected.length,
      rejected_detail: rejected.slice(0, 5),
      skipped,
      cursor: cursor + ids.length,
      remaining: Math.max(0, IDS.length - (cursor + ids.length)),
    });
  }

  return json({ error: 'unknown action' }, 400);
}

const PAGE = String.raw`<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex">
<title>Expand short prompts</title>
<style>body{font-family:system-ui,sans-serif;max-width:720px;margin:0 auto;padding:16px;line-height:1.5}
button{font-size:16px;padding:10px 14px;margin:4px 6px 4px 0;border-radius:8px;border:1px solid #888;background:#fff}
button.p{background:#4f46e5;color:#fff;border-color:#4f46e5}button.d{background:#b91c1c;color:#fff;border-color:#b91c1c}
pre{white-space:pre-wrap;background:#f4f4f5;padding:10px;border-radius:8px;font-size:13px}
#bar{height:12px;background:#e5e7eb;border-radius:6px;overflow:hidden}#fill{height:100%;width:0;background:#4f46e5}</style></head><body>
<h2>Expand short prompts</h2>
<p>Thinnest prompts first. Old text is backed up. You can stop any time and continue later.</p>
<div id="bar"><div id="fill"></div></div><p id="st">Loading status...</p>
<button onclick="test()">Test 3 prompts (saves nothing)</button>
<button class="p" onclick="start()">Start auto-run</button>
<button onclick="stop()">Stop</button>
<button onclick="sample()">Show 5 changes</button>
<button class="d" onclick="undo()">Undo everything</button>
<pre id="log"></pre>
<script>
var running=false, totalSaved=0, totalRejected=0;
function log(t){var el=document.getElementById('log');el.textContent=t+'\n\n'+el.textContent.slice(0,6000);}
function api(a,extra){return fetch('?action='+a+(extra||''),{credentials:'same-origin'}).then(function(r){return r.json().then(function(j){j._status=r.status;return j;});});}
function status(){return api('status').then(function(j){
  if(j.error){document.getElementById('st').textContent='Error: '+j.error;return j;}
  var done=j.total-j.remaining;document.getElementById('fill').style.width=(100*done/j.total)+'%';
  document.getElementById('st').textContent='Processed '+done+' of '+j.total+' | saved '+j.saved+' | rejected '+j.failed+' | left '+j.remaining;return j;});}
function test(){log('Testing 3 prompts...');api('test').then(function(j){
  if(j.error){log('ERROR '+j.error+': '+(j.detail||''));return;}
  var s='TEST (nothing saved)\n';(j.accepted||[]).forEach(function(a){s+='\n['+a.slug+'] '+a.chars+' chars\nOLD: '+a.old+'\nNEW: '+a.new+'\n';});
  (j.rejected||[]).forEach(function(r){s+='\nREJECTED '+r.slug+': '+r.reason;});log(s);});}
function sample(){api('sample').then(function(j){var s='LATEST 5 CHANGES\n';(j.latest_changes||[]).forEach(function(c){s+='\n['+c.slug+']\nOLD: '+c.old_prompt+'\nNEW: '+c.new_prompt+'\n';});log(s);});}
function stop(){running=false;log('Stopping after the current step...');}
function undo(){if(!confirm('Restore ALL changed prompts to their old text?'))return;api('rollback').then(function(j){log(JSON.stringify(j));status();});}
function step(){if(!running)return;api('run').then(function(j){
  if(j.error){running=false;log('STOPPED: '+j.error+' - '+(j.detail||''));status();return;}
  if(j.done){running=false;log('ALL DONE.');status();return;}
  totalSaved+=j.saved;totalRejected+=j.rejected;
  log('Step ok: saved '+j.saved+', rejected '+j.rejected+(j.rejected_detail&&j.rejected_detail.length?' ('+j.rejected_detail.map(function(x){return x.reason;}).join('; ')+')':'')+' | left '+j.remaining);
  status().then(function(){setTimeout(step,3500);});}).catch(function(e){running=false;log('STOPPED (network): '+e);});}
function start(){if(running)return;running=true;log('Auto-run started. Keep this page open.');step();}
status();
</script></body></html>`;
