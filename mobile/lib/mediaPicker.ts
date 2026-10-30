/**
 * Unified Media Picker Service
 * Handles runtime permissions, camera & gallery launching, silent user cancellation,
 * URI normalization (content://, FileProvider, HEIC -> file:// JPEG),
 * and image compression (max 1024x1024 at 80% JPEG quality).
 */

import { Alert, Linking, Platform } from "react-native";
import * as ImagePicker from "expo-image-picker";
import * as FileSystem from "expo-file-system/legacy";

export interface NormalizedImageAsset {
  uri: string;
  name: string;
  mimeType: string;
  size?: number;
  width?: number;
  height?: number;
  base64?: string;
}

export interface PickImageOptions {
  allowsEditing?: boolean;
  aspect?: [number, number];
  maxDimension?: number;
  quality?: number;
}

/**
 * Prompt user to open system settings when a permission has been permanently denied.
 */
function showPermissionAlert(title: string, message: string, canAskAgain: boolean) {
  if (!canAskAgain && Platform.OS !== "web") {
    Alert.alert(title, message, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Open Settings",
        onPress: () => {
          Linking.openSettings().catch(() => {});
        },
      },
    ]);
  } else {
    Alert.alert(title, message);
  }
}

/**
 * Verify and request runtime Camera permissions.
 */
export async function ensureCameraPermission(): Promise<boolean> {
  try {
    let permission = await ImagePicker.getCameraPermissionsAsync();
    if (!permission.granted) {
      permission = await ImagePicker.requestCameraPermissionsAsync();
    }

    if (!permission.granted) {
      showPermissionAlert(
        "Camera Permission Required",
        "Please allow camera access in your device settings to take photos of legal documents.",
        permission.canAskAgain ?? true,
      );
      return false;
    }

    return true;
  } catch (error) {
    console.warn("Error checking camera permission:", error);
    Alert.alert(
      "Camera Unavailable",
      "Could not access the camera. Please check your device permissions.",
    );
    return false;
  }
}

/**
 * Verify and request runtime Photo Library / Gallery permissions.
 */
export async function ensureMediaLibraryPermission(): Promise<boolean> {
  try {
    let permission = await ImagePicker.getMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    }

    if (!permission.granted) {
      showPermissionAlert(
        "Photo Library Permission Required",
        "Please allow photo library access in your device settings to select images.",
        permission.canAskAgain ?? true,
      );
      return false;
    }

    return true;
  } catch (error) {
    console.warn("Error checking media library permission:", error);
    Alert.alert(
      "Gallery Unavailable",
      "Could not access your photo library. Please check your device permissions.",
    );
    return false;
  }
}

/**
 * Normalize an ImagePickerAsset into a verified local `file://` JPEG URI,
 * resizing to max 1024x1024 and compressing at 80% quality.
 * Handles Android `content://` FileProvider URIs and iOS HEIC/HEIF conversion.
 */
export async function normalizeAndCompressImage(
  asset: ImagePicker.ImagePickerAsset,
  maxDimension: number = 1024,
  quality: number = 0.8,
): Promise<NormalizedImageAsset> {
  const timestamp = Date.now();
  const cacheDir = FileSystem.cacheDirectory || "";
  const fallbackTargetUri = `${cacheDir}img_${timestamp}.jpg`;

  let workingUri = asset.uri;
  let width = asset.width || 0;
  let height = asset.height || 0;

  // 1. Normalize content:// or non-file:// URIs into app cache directory
  if (!workingUri.startsWith("file://") && cacheDir) {
    try {
      await FileSystem.copyAsync({
        from: workingUri,
        to: fallbackTargetUri,
      });
      workingUri = fallbackTargetUri;
    } catch {
      // If copyAsync fails on a custom FileProvider, write from base64 if available
      if (asset.base64) {
        await FileSystem.writeAsStringAsync(fallbackTargetUri, asset.base64, {
          encoding: FileSystem.EncodingType.Base64,
        });
        workingUri = fallbackTargetUri;
      }
    }
  }

  // 2. Resize (max 1024x1024) & compress (80% JPEG) via expo-image-manipulator if available
  try {
    const ImageManipulator = require("expo-image-manipulator");
    if (ImageManipulator && typeof ImageManipulator.manipulateAsync === "function") {
      const actions: any[] = [];
      if (width > maxDimension || height > maxDimension) {
        if (width >= height) {
          actions.push({ resize: { width: maxDimension } });
        } else {
          actions.push({ resize: { height: maxDimension } });
        }
      }

      const manipulated = await ImageManipulator.manipulateAsync(
        workingUri,
        actions,
        {
          compress: quality,
          format: ImageManipulator.SaveFormat?.JPEG ?? "jpeg",
          base64: false,
        },
      );

      if (manipulated?.uri) {
        workingUri = manipulated.uri;
        width = manipulated.width ?? width;
        height = manipulated.height ?? height;
        if (manipulated.base64) {
          asset.base64 = manipulated.base64;
        }
      }
    }
  } catch {
    // Native module not linked in older dev client build; fallback to ImagePicker's JPEG output
  }

  // 3. If the file is HEIC/HEIF or doesn't exist at workingUri, write the JPEG base64 buffer to cache
  const isHeic =
    workingUri.toLowerCase().endsWith(".heic") ||
    workingUri.toLowerCase().endsWith(".heif") ||
    (asset.mimeType && asset.mimeType.toLowerCase().includes("heic"));

  if (isHeic && asset.base64 && cacheDir) {
    await FileSystem.writeAsStringAsync(fallbackTargetUri, asset.base64, {
      encoding: FileSystem.EncodingType.Base64,
    });
    workingUri = fallbackTargetUri;
  }

  // 4. Verify the normalized file path is readable on disk
  let fileSize = asset.fileSize;
  try {
    const info = await FileSystem.getInfoAsync(workingUri);
    if (!info.exists && asset.base64 && cacheDir) {
      await FileSystem.writeAsStringAsync(fallbackTargetUri, asset.base64, {
        encoding: FileSystem.EncodingType.Base64,
      });
      workingUri = fallbackTargetUri;
      const retryInfo = await FileSystem.getInfoAsync(workingUri);
      if (retryInfo.exists && "size" in retryInfo) {
        fileSize = retryInfo.size;
      }
    } else if (info.exists && "size" in info) {
      fileSize = info.size;
    }
  } catch {
    // Ignore getInfoAsync errors if base64 is already present
  }

  // Ensure clean .jpg filename
  const rawName = asset.fileName || `image_${timestamp}.jpg`;
  const baseName = rawName.replace(/\.[^/.]+$/, "");
  const normalizedName = `${baseName}.jpg`;

  return {
    uri: workingUri,
    name: normalizedName,
    mimeType: "image/jpeg",
    size: fileSize,
    width,
    height,
    base64: asset.base64 || undefined,
  };
}

/**
 * Launch the device camera with full permission checks and image normalization.
 * Returns `null` silently if the user cancels.
 */
export async function pickImageFromCamera(
  options: PickImageOptions = {},
): Promise<NormalizedImageAsset | null> {
  const hasPermission = await ensureCameraPermission();
  if (!hasPermission) return null;

  const quality = options.quality ?? 0.8;
  const maxDimension = options.maxDimension ?? 1024;

  const result = await ImagePicker.launchCameraAsync({
    mediaTypes: ["images"],
    allowsEditing: options.allowsEditing ?? false,
    aspect: options.aspect,
    quality,
    base64: false,
    preferredAssetRepresentationMode:
      ImagePicker.UIImagePickerPreferredAssetRepresentationMode?.Compatible,
  });

  // Handle user cancellation silently
  if (!result || result.canceled || !result.assets || result.assets.length === 0) {
    return null;
  }

  return normalizeAndCompressImage(result.assets[0], maxDimension, quality);
}

/**
 * Launch the photo library picker with full permission checks, crop fallback,
 * silent cancellation handling, and image normalization.
 */
export async function pickImageFromGallery(
  options: PickImageOptions = {},
): Promise<NormalizedImageAsset | null> {
  const hasPermission = await ensureMediaLibraryPermission();
  if (!hasPermission) return null;

  const quality = options.quality ?? 0.8;
  const maxDimension = options.maxDimension ?? 1024;

  let result: ImagePicker.ImagePickerResult;
  try {
    result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      allowsEditing: options.allowsEditing ?? false,
      aspect: options.aspect,
      quality,
      base64: false,
      preferredAssetRepresentationMode:
        ImagePicker.UIImagePickerPreferredAssetRepresentationMode?.Compatible,
    });
  } catch (err) {
    // If Android CropImageActivity or FileProvider fails when allowsEditing is true,
    // automatically retry without native cropping so the picker still succeeds.
    if (options.allowsEditing) {
      result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ["images"],
        allowsEditing: false,
        quality,
        base64: false,
        preferredAssetRepresentationMode:
          ImagePicker.UIImagePickerPreferredAssetRepresentationMode?.Compatible,
      });
    } else {
      throw err;
    }
  }

  // Handle user cancellation silently
  if (!result || result.canceled || !result.assets || result.assets.length === 0) {
    return null;
  }

  return normalizeAndCompressImage(result.assets[0], maxDimension, quality);
}
