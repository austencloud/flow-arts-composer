/** Native variants shared by mesh preparation and portable motion capture. */
export const nativePropVariants = id => {
  if (id === 'buugeng' || id === 'bigbuugeng') return [
    { id: 'matching-a', leftFlipped: false, rightFlipped: false },
    { id: 'mirrored-ab', leftFlipped: false, rightFlipped: true },
    { id: 'mirrored-ba', leftFlipped: true, rightFlipped: false },
    { id: 'matching-b', leftFlipped: true, rightFlipped: true },
  ];
  if (id === 'fan' || id === 'bigfan') {
    const result = [{ id: 'pictograph' }];
    for (const build of ['fire', 'lotus', 'day', 'moon', 'flat-grip', 'star']) {
      for (const frame of build === 'day' ? ['black', 'white'] : ['black']) {
        for (const cover of ['fire', 'day'].includes(build) ? ['bare', 'covered'] : ['bare']) {
          result.push({ id: [build, frame, cover].join('_'), fanBuild: build, fanFrameColor: frame, fanCover: cover });
        }
      }
    }
    return result;
  }
  if (['triad', 'bigtriad', 'quiad'].includes(id)) return [{ id: 'fire', finish: 'fire' }, { id: 'day', finish: 'day' }];
  if (id === 'triangle') return [{ id: 'corner', triangleGrip: 'corner' }, { id: 'side', triangleGrip: 'side' }];
  return [{ id: 'default' }];
};
