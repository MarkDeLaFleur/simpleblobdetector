// Port of https://github.com/opencv/opencv/blob/a50a355/modules/features2d/src/blobdetector.cpp
class SimpleBlobDetector {
  constructor(params) {
    this._params = {
      thresholdStep: 10,
      minThreshold: 50,
      maxThreshold: 220,
      minRepeatability: 2,
      minDistBetweenBlobs: 10,

      filterByColor: true,
      blobColor: 0,

      filterByArea: true,
      minArea: 25,
      maxArea: 5000,

      filterByCircularity: false,
      minCircularity: 0.8,
      maxCircularity: 1000000,

      filterByInertia: true,
      //minInertiaRatio: 0.6,
      minInertiaRatio: 0.1,
      maxInertiaRatio: 1000000,

      filterByConvexity: true,
      //minConvexity: 0.8,
      minConvexity: 0.95,
      maxConvexity: 1000000,

      ...params,
    };
  }

  norm(point1, point2) {
    return Math.sqrt(Math.pow(point1.x - point2.x, 2) + Math.pow(point1.y - point2.y, 2));
  }

  findBlobs(image, binaryImage) {
    const contours = new cv.MatVector();
    const hierarchy = new cv.Mat();
    cv.findContours(binaryImage, contours, hierarchy, cv.RETR_LIST, cv.CHAIN_APPROX_NONE);
    hierarchy.delete();

    const centers = [];
    for (let i = 0; i < contours.size(); i++) {
      const contour = contours.get(i);
      const moms = cv.moments(contour);

      if (moms.m00 == 0.0) continue;
      const center = {
        confidence: 1,
        location: { x: moms.m10 / moms.m00, y: moms.m01 / moms.m00 },
      };

      if (this._params.filterByArea) {
        const area = moms.m00;
        if (area < this._params.minArea || area >= this._params.maxArea) continue;
      }

      if (this._params.filterByCircularity) {
        const area = moms.m00;
        const perimeter = cv.arcLength(contour, true);
        const ratio = 4 * cv.CV_PI * area / (perimeter * perimeter);
        if (ratio < this._params.minCircularity || ratio >= this._params.maxCircularity) continue;
      }

      if (this._params.filterByInertia) {
        const denominator = Math.sqrt(
          Math.pow(2 * moms.mu11, 2) + Math.pow(moms.mu20 - moms.mu02, 2)
        );
        let ratio;
        if (denominator > 0.01) {
          const cosmin = (moms.mu20 - moms.mu02) / denominator;
          const sinmin = 2 * moms.mu11 / denominator;
          const cosmax = -cosmin;
          const sinmax = -sinmin;

          const imin =
            0.5 * (moms.mu20 + moms.mu02) -
            0.5 * (moms.mu20 - moms.mu02) * cosmin -
            moms.mu11 * sinmin;
          const imax =
            0.5 * (moms.mu20 + moms.mu02) -
            0.5 * (moms.mu20 - moms.mu02) * cosmax -
            moms.mu11 * sinmax;
          ratio = imin / imax;
        } else {
          ratio = 1;
        }

        if (ratio < this._params.minInertiaRatio || ratio >= this._params.maxInertiaRatio) continue;

        center.confidence = ratio * ratio;
      }

      if (this._params.filterByConvexity) {
        const hull = new cv.Mat();
        cv.convexHull(contour, hull);
        const area = cv.contourArea(contour);
        const hullArea = cv.contourArea(hull);
        const ratio = area / hullArea;
        hull.delete();
        if (ratio < this._params.minConvexity || ratio >= this._params.maxConvexity) continue;
      }

      if (this._params.filterByColor) {
        if (
          binaryImage.ucharAt(Math.round(center.location.y), Math.round(center.location.x)) !=
          this._params.blobColor
        )
          continue;
      }

      {
        const dists = [];
        for (let pointIdx = 0; pointIdx < contour.size().height; pointIdx++) {
          const pt = contour.intPtr(pointIdx);
          dists.push(this.norm(center.location, { x: pt[0], y: pt[1] }));
        }
        dists.sort();
        center.radius =
          (dists[Math.floor((dists.length - 1) / 2)] + dists[Math.floor(dists.length / 2)]) / 2;
      }

      centers.push(center);
    }
    contours.delete();
    return centers;
  }

  detect(image) {
    const grayScaleImage = new cv.Mat(image.rows, image.cols, cv.CV_8UC1);
    cv.cvtColor(image, grayScaleImage, cv.COLOR_BGR2GRAY);

    let centers = [];
    for (
      let thresh = this._params.minThreshold;
      thresh < this._params.maxThreshold;
      thresh += this._params.thresholdStep
    ) {
      const binaryImage = new cv.Mat(image.rows, image.cols, cv.CV_8UC1);
      cv.threshold(grayScaleImage, binaryImage, thresh, 255, cv.THRESH_BINARY);
      let curCenters = this.findBlobs(image, binaryImage);
      binaryImage.delete();
      let newCenters = [];

      for (let i = 0; i < curCenters.length; i++) {
        let isNew = true;
        for (let j = 0; j < centers.length; j++) {
          const dist = this.norm(
            centers[j][Math.floor(centers[j].length / 2)].location,
            curCenters[i].location
          );
          isNew =
            dist >= this._params.minDistBetweenBlobs &&
            dist >= centers[j][Math.floor(centers[j].length / 2)].radius &&
            dist >= curCenters[i].radius;
          if (!isNew) {
            centers[j].push(curCenters[i]);

            let k = centers[j].length - 1;
            while (k > 0 && centers[j][k].radius < centers[j][k - 1].radius) {
              centers[j][k] = centers[j][k - 1];
              k--;
            }
            centers[j][k] = curCenters[i];
            break;
          }
        }
        if (isNew) newCenters.push([curCenters[i]]);
      }
      centers = centers.concat(newCenters);
    }

    grayScaleImage.delete();

    const keyPoints = [];
    for (let i = 0; i < centers.length; i++) {
      if (centers[i].length < this._params.minRepeatability) continue;
      const sumPoint = { x: 0, y: 0 };
      let normalizer = 0;
      for (let j = 0; j < centers[i].length; j++) {
        sumPoint.x += centers[i][j].confidence * centers[i][j].location.x;
        sumPoint.y += centers[i][j].confidence * centers[i][j].location.y;
        normalizer += centers[i][j].confidence;
      }
      sumPoint.x *= 1 / normalizer;
      sumPoint.y *= 1 / normalizer;
      keyPoints.push({
        pt: sumPoint,
        size: centers[i][Math.floor(centers[i].length / 2)].radius * 2,
      });
    }

    return keyPoints;
  }
}