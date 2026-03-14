const REGIONS = ['us', 'eu', 'apac'];

const initialize = () => {
    const vc = {};
    REGIONS.forEach((r) => {
        vc[r] = 0;
    });
    return vc;
};

const increment = (vc, region) => {
    const newVc = { ...vc };
    newVc[region] = (newVc[region] || 0) + 1;
    return newVc;
};

const compare = (vc1, vc2) => {
    let less = false;
    let greater = false;

    for (const r of REGIONS) {
        const v1 = vc1[r] || 0;
        const v2 = vc2[r] || 0;
        if (v1 < v2) less = true;
        if (v1 > v2) greater = true;
    }

    if (less && !greater) return 'BEFORE';
    if (greater && !less) return 'AFTER';
    if (!less && !greater) return 'EQUAL';
    return 'CONCURRENT';
};

const merge = (vc1, vc2) => {
    const merged = {};
    REGIONS.forEach((r) => {
        merged[r] = Math.max(vc1[r] || 0, vc2[r] || 0);
    });
    return merged;
};

module.exports = {
    initialize,
    increment,
    compare,
    merge,
};
