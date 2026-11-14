import React from 'react';
import {
  View,
  Text,
  Modal,
  StyleSheet,
  TouchableOpacity,
  Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { COLORS, SPACING, RADIUS, SHADOW } from '@/lib/utils';

interface StudentPhotoPickerModalProps {
  visible: boolean;
  onClose: () => void;
  onPhotoSelected: (uri: string | null) => void;
  hasExistingPhoto?: boolean;
  studentName?: string;
}

export function StudentPhotoPickerModal({
  visible,
  onClose,
  onPhotoSelected,
  hasExistingPhoto = false,
  studentName,
}: StudentPhotoPickerModalProps) {
  const handleTakePhoto = async () => {
    try {
      const { status } = await ImagePicker.requestCameraPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permission Denied', 'Camera permission is required to capture student photos.');
        return;
      }

      const result = await ImagePicker.launchCameraAsync({
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.8,
      });

      if (!result.canceled && result.assets && result.assets[0]?.uri) {
        onPhotoSelected(result.assets[0].uri);
        onClose();
      }
    } catch (err) {
      console.error('Camera capture error', err);
      Alert.alert('Camera Error', 'Could not access camera on this device.');
    }
  };

  const handlePickFromGallery = async () => {
    try {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permission Denied', 'Photo library permission is required to select photos.');
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.8,
      });

      if (!result.canceled && result.assets && result.assets[0]?.uri) {
        onPhotoSelected(result.assets[0].uri);
        onClose();
      }
    } catch (err) {
      console.error('Gallery pick error', err);
      Alert.alert('Gallery Error', 'Could not open photo gallery.');
    }
  };

  const handleRemovePhoto = () => {
    onPhotoSelected(null);
    onClose();
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <TouchableOpacity style={StyleSheet.absoluteFill} activeOpacity={1} onPress={onClose} />
        <View style={styles.sheetContainer}>
          <View style={styles.sheetHandle} />
          <Text style={styles.sheetTitle}>Student Photo</Text>
          <Text style={styles.sheetSub}>
            {studentName ? `Update photo for ${studentName}` : 'Upload or capture student profile photo'}
          </Text>

          <View style={styles.actionsWrap}>
            <TouchableOpacity style={styles.actionRow} onPress={handleTakePhoto} activeOpacity={0.7}>
              <View style={[styles.iconWrap, { backgroundColor: '#EEF0FD' }]}>
                <Ionicons name="camera" size={20} color={COLORS.primary} />
              </View>
              <View style={styles.actionTextWrap}>
                <Text style={styles.actionTitle}>Take Photo</Text>
                <Text style={styles.actionDesc}>Capture photo directly with camera</Text>
              </View>
              <Ionicons name="chevron-forward" size={16} color={COLORS.textDim} />
            </TouchableOpacity>

            <TouchableOpacity style={styles.actionRow} onPress={handlePickFromGallery} activeOpacity={0.7}>
              <View style={[styles.iconWrap, { backgroundColor: '#E0F2FE' }]}>
                <Ionicons name="images" size={20} color="#0284C7" />
              </View>
              <View style={styles.actionTextWrap}>
                <Text style={styles.actionTitle}>Choose from Gallery</Text>
                <Text style={styles.actionDesc}>Pick existing photo from device library</Text>
              </View>
              <Ionicons name="chevron-forward" size={16} color={COLORS.textDim} />
            </TouchableOpacity>

            {hasExistingPhoto && (
              <TouchableOpacity style={styles.actionRow} onPress={handleRemovePhoto} activeOpacity={0.7}>
                <View style={[styles.iconWrap, { backgroundColor: '#FEF2F2' }]}>
                  <Ionicons name="trash" size={20} color="#EF4444" />
                </View>
                <View style={styles.actionTextWrap}>
                  <Text style={[styles.actionTitle, { color: '#EF4444' }]}>Remove Photo</Text>
                  <Text style={styles.actionDesc}>Delete current student photo</Text>
                </View>
                <Ionicons name="chevron-forward" size={16} color={COLORS.textDim} />
              </TouchableOpacity>
            )}
          </View>

          <TouchableOpacity style={styles.cancelBtn} onPress={onClose} activeOpacity={0.8}>
            <Text style={styles.cancelBtnText}>Cancel</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.45)',
    justifyContent: 'flex-end',
  },
  sheetContainer: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: RADIUS.xl,
    borderTopRightRadius: RADIUS.xl,
    paddingHorizontal: SPACING.lg,
    paddingTop: SPACING.sm,
    paddingBottom: SPACING.xl,
    ...SHADOW.lg,
  },
  sheetHandle: {
    width: 38,
    height: 4,
    backgroundColor: '#CBD5E1',
    borderRadius: 2,
    alignSelf: 'center',
    marginBottom: SPACING.md,
  },
  sheetTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: COLORS.text,
  },
  sheetSub: {
    fontSize: 13,
    color: COLORS.textMuted,
    marginTop: 2,
    marginBottom: SPACING.md,
  },
  actionsWrap: {
    gap: 10,
  },
  actionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F4F5FB',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: RADIUS.md,
    padding: SPACING.md,
  },
  iconWrap: {
    width: 42,
    height: 42,
    borderRadius: RADIUS.md,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: SPACING.md,
  },
  actionTextWrap: {
    flex: 1,
  },
  actionTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: COLORS.text,
  },
  actionDesc: {
    fontSize: 12,
    color: COLORS.textMuted,
    marginTop: 2,
  },
  cancelBtn: {
    marginTop: SPACING.md,
    backgroundColor: '#F1F5F9',
    borderRadius: RADIUS.md,
    paddingVertical: 11,
    alignItems: 'center',
  },
  cancelBtnText: {
    fontSize: 14,
    fontWeight: '700',
    color: COLORS.textMuted,
  },
});
